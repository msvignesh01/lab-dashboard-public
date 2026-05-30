import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, handleApi, sendOk } from '../_lib/http.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: false,
    })

    return sendOk(res, context.profile)
})
