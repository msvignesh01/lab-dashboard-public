// Framework-neutral constants shared by trusted backend policy code and clients.

export const DEPARTMENTS = [
    'CSE',
    'ECE',
    'EEE',
    'Mechanical',
    'Civil',
    'Chemical',
    'Biotechnology',
]

export const ROLES = ['student', 'faculty', 'admin']

export const BOOKING_STATUS = ['pending', 'approved', 'rejected', 'cancelled']

export const BOOKING_LIMITS = {
    MAX_DURATION_HOURS: 8,
    MAX_ADVANCE_DAYS: 30,
    LOCK_BUCKET_MINUTES: 15,
    DEFAULT_START_HOUR: 9,
    DEFAULT_END_HOUR: 18,
}

export const LAB_DEFAULTS = {
    TIMEZONE: 'Asia/Kolkata',
    OPEN_TIME: '09:00:00',
    CLOSE_TIME: '18:00:00',
    ACTIVE_WEEKDAYS: [1, 2, 3, 4, 5, 6],
}

export const WEEKDAYS = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
]

export const BOOKING_STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
}

export const TRAINING_STATUS_LABELS = {
    active: 'Approved',
    revoked: 'Revoked',
}

export const EMAIL_DOMAINS = {
    STUDENT: '@btech.christuniversity.in',
    FACULTY: '@christuniversity.in',
}

export const RATE_LIMIT = {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 5 * 60 * 1000,
    STORAGE_KEY: '_rl_auth_state',
}
