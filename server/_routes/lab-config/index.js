import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk } from '../../_lib/http.js'
import { getLabConfig, getLabConfigRef, sanitizeLabConfigPayload } from '../../_lib/labConfig.js'
import { runAuditedTransaction } from '../../_lib/audit.js'
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
    const body = await parseJsonBody(req)
    const configRef = getLabConfigRef()

    const nextConfig = await runAuditedTransaction({
        actor: context,
        mutate: async (transaction) => {
            const current = await getLabConfig(transaction)
            const updated = sanitizeLabConfigPayload(body, current, context.uid)
            transaction.set(configRef, updated, { merge: true })
            return {
                result: updated,
                audit: {
                    action: 'lab_config.updated',
                    entity_type: 'lab_config',
                    entity_id: 'default',
                    metadata: {
                        open_time: updated.open_time,
                        close_time: updated.close_time,
                        active_weekdays: updated.active_weekdays,
                        max_advance_days: updated.max_advance_days,
                        max_duration_hours: updated.max_duration_hours,
                    },
                },
            }
        },
    })

    return sendOk(res, nextConfig)
})
