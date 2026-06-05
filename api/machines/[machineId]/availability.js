import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { getAvailabilityForMachine } from '../../_lib/availability.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
    })

    const machineId = getRouteParam(req, 'machineId')
    const date = typeof req.query?.date === 'string' ? req.query.date : ''

    if (!isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Invalid machine ID.', 'invalid_machine_id')
    }

    const availability = await getAvailabilityForMachine({
        machineId,
        dateString: date,
        studentId: context.profile.role === 'student' ? context.uid : null,
    })

    return sendOk(res, availability)
})
