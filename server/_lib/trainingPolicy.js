import { ApiError } from './http.js'

const TRAINING_STATUSES = new Set(['active', 'revoked'])

export const parseTrainingStatus = (value) => {
    const status = typeof value === 'string' ? value.trim() : ''
    if (!TRAINING_STATUSES.has(status)) {
        throw new ApiError(400, 'Training status must be active or revoked.', 'invalid_training_status')
    }
    return status
}

export const assertValidTrainingTargets = ({ studentProfile, machine }) => {
    if (!studentProfile?.id) {
        throw new ApiError(404, 'Student profile not found.', 'student_not_found')
    }
    if (studentProfile.role !== 'student') {
        throw new ApiError(400, 'Training approvals can only be assigned to students.', 'invalid_training_student')
    }
    if (!machine?.id) {
        throw new ApiError(404, 'Machine not found.', 'machine_not_found')
    }
}
