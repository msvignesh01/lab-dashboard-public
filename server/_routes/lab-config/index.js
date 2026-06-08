import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk } from '../../_lib/http.js'
import { getLabConfig, getLabConfigRef, sanitizeLabConfigPayload } from '../../_lib/labConfig.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'PATCH'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: req.method === 'PATCH' ? ['admin'] : [],
    })

    if (req.method === 'GET') {
        const config = await getLabConfig()
        return sendOk(res, config)
    }

    await assertRateLimit({ uid: context.uid, action: 'lab_config_update', limit: 12, windowMs: 60_000 })
    const current = await getLabConfig()
    const body = await parseJsonBody(req)
    const nextConfig = sanitizeLabConfigPayload(body, current, context.uid)

    await getLabConfigRef().set(nextConfig, { merge: true })
    await writeAuditLog({
        actor: context,
        action: 'lab_config.updated',
        entity_type: 'lab_config',
        entity_id: 'default',
        metadata: {
            open_time: nextConfig.open_time,
            close_time: nextConfig.close_time,
            active_weekdays: nextConfig.active_weekdays,
            max_advance_days: nextConfig.max_advance_days,
            max_duration_hours: nextConfig.max_duration_hours,
        },
    })

    return sendOk(res, nextConfig)
})
