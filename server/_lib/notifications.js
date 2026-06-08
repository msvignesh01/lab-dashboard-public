import crypto from 'node:crypto'
import { adminDb } from './firebaseAdmin.js'

const toSafeText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength)

export const buildNotification = ({ userId, type, title, message, entity = {}, channels = {} }) => {
    const id = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    return {
        id,
        user_id: userId,
        type: toSafeText(type, 80),
        title: toSafeText(title, 160),
        message: toSafeText(message, 800),
        entity: {
            type: toSafeText(entity.type, 80),
            id: toSafeText(entity.id, 128),
        },
        read_at: null,
        channels: {
            in_app: 'created',
            email: channels.email || 'not_attempted',
        },
        created_at: timestamp,
        updated_at: timestamp,
    }
}

export const sendEmailNotification = async ({ to, subject, text }) => {
    const apiKey = process.env.EMAIL_PROVIDER_API_KEY
    const from = process.env.NOTIFICATION_FROM_EMAIL

    if (!apiKey || !from || !to) {
        return { status: 'skipped', reason: 'not_configured' }
    }

    const endpoint = process.env.EMAIL_PROVIDER_ENDPOINT || 'https://api.resend.com/emails'
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to,
                subject: toSafeText(subject, 160),
                text: toSafeText(text, 2000),
            }),
        })
        if (!response.ok) return { status: 'failed', reason: `http_${response.status}` }
        return { status: 'sent' }
    } catch {
        return { status: 'failed', reason: 'network_error' }
    }
}

export const createNotification = async ({ profile, type, title, message, entity, email = false }) => {
    if (!profile?.id) return null
    const record = buildNotification({
        userId: profile.id,
        type,
        title,
        message,
        entity,
        channels: { email: email ? 'pending' : 'not_requested' },
    })

    await adminDb.collection('notifications').doc(record.id).set(record)

    if (!email) return record

    const result = await sendEmailNotification({
        to: profile.email,
        subject: title,
        text: message,
    })

    await adminDb.collection('notifications').doc(record.id).set({
        channels: {
            ...record.channels,
            email: result.status,
            email_reason: result.reason || null,
        },
        updated_at: new Date().toISOString(),
    }, { merge: true }).catch(() => {})

    return {
        ...record,
        channels: {
            ...record.channels,
            email: result.status,
            email_reason: result.reason || null,
        },
    }
}

export const notifyFacultyAndAdmins = async ({ type, title, message, entity }) => {
    const snapshot = await adminDb.collection('profiles').where('status', '==', 'active').get()
    const recipients = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((profile) => ['faculty', 'admin'].includes(profile.role))

    await Promise.all(recipients.map((profile) => createNotification({
        profile,
        type,
        title,
        message,
        entity,
        email: false,
    })))
}
