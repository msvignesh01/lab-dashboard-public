// Internal data sync handler
// Receives webhook payloads and syncs to external audit sheet
import crypto from 'node:crypto';

export function toSafeString(value, maxLen = 500) {
    if (value === null || value === undefined) return '';
    const text = String(value).trim().slice(0, maxLen);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

/**
 * Generate a signed JWT for Google service account authentication.
 * Uses Node.js built-in crypto — zero npm dependencies.
 */
function createServiceAccountJWT() {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');

    const now = Math.floor(Date.now() / 1000);
    const claims = {
        iss: process.env.GCP_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    // The private key from GCP JSON is stored with literal \n — restore to real newlines
    const privateKey = process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(privateKey, 'base64url');

    return `${header}.${payload}.${signature}`;
}

/** Exchange the signed JWT for a short-lived Google OAuth2 access token. */
async function getAccessToken() {
    const jwt = createServiceAccountJWT();
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token;
}

/** Append a single row to the configured Google Sheet. */
async function appendRow(accessToken, values) {
    const sheetId = process.env.AUDIT_SHEET_ID;
    const range = encodeURIComponent('Sheet1!A:Z');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [values] }),
    });
    return res.ok;
}

export default async function handler(req, res) {
    // Only POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    // Basic content-type guard
    const contentType = req.headers['content-type'] || '';
    if (!String(contentType).includes('application/json')) {
        return res.status(415).json({ message: 'Unsupported media type' });
    }

    // Guard required environment variables
    const requiredEnvVars = ['GCP_CLIENT_EMAIL', 'GCP_PRIVATE_KEY', 'AUDIT_SHEET_ID', 'INTERNAL_WEBHOOK_SECRET'];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            return res.status(500).json({ message: 'Server misconfigured' });
        }
    }

    // Verify shared secret supplied by the internal Firebase/profile sync caller.
    const headerSecret = req.headers['x-webhook-secret'];
    const providedSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    const expectedSecret = process.env.INTERNAL_WEBHOOK_SECRET;

    if (!providedSecret || !expectedSecret) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const providedBuffer = Buffer.from(String(providedSecret), 'utf8');
    const expectedBuffer = Buffer.from(String(expectedSecret), 'utf8');
    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({ message: 'Invalid payload' });
        }

        const rawPayloadSize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
        if (rawPayloadSize > 16 * 1024) {
            return res.status(413).json({ message: 'Payload too large' });
        }

        const { type, table, record } = req.body;

        // Only process new profile inserts
        if (type !== 'INSERT' || table !== 'profiles' || !record) {
            return res.status(200).json({ skipped: true });
        }

        // Minimal shape validation for profile payload
        if (typeof record !== 'object' || typeof record.id !== 'string' || typeof record.email !== 'string') {
            return res.status(400).json({ message: 'Malformed record payload' });
        }

        const accessToken = await getAccessToken();
        if (!accessToken) {
            return res.status(500).json({ message: 'Auth failed' });
        }

        // Build the row: Timestamp, ID, Email, Name, Role, Dept, Register#, Phone, Event
        const row = [
            new Date().toISOString(),
            toSafeString(record.id, 64),
            toSafeString(record.email, 254),
            toSafeString(record.full_name, 120),
            toSafeString(record.role, 32),
            toSafeString(record.department, 100),
            toSafeString(record.register_number, 40),
            toSafeString(record.phone, 40),
            'SIGNUP',
        ];

        const ok = await appendRow(accessToken, row);
        if (!ok) {
            return res.status(500).json({ message: 'Sheet write failed' });
        }

        return res.status(200).json({ ok: true });
    } catch {
        return res.status(500).json({ message: 'Internal error' });
    }
}
