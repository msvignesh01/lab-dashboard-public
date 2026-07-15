import { ApiError } from './http.js'

export const verifyFirebaseIdToken = async (auth, token) => {
    try {
        return await auth.verifyIdToken(token, true)
    } catch {
        throw new ApiError(401, 'Authentication required', 'invalid_auth_token')
    }
}
