// Shared constants used across the application

export const DEPARTMENTS = [
    'CSE',
    'ECE',
    'EEE',
    'Mechanical',
    'Civil',
    'Chemical',
    'Biotechnology'
];

export const ROLES = ['student', 'faculty', 'admin'];

export const BOOKING_STATUS = ['pending', 'approved', 'rejected', 'cancelled'];

export const BOOKING_LIMITS = {
    MAX_DURATION_HOURS: 8,
    MAX_ADVANCE_DAYS: 30,
    DEFAULT_START_HOUR: 9,
    DEFAULT_END_HOUR: 18
};

export const EMAIL_DOMAINS = {
    STUDENT: '@btech.christuniversity.in',
    FACULTY: '@christuniversity.in'
};

export const RATE_LIMIT = {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
    STORAGE_KEY: '_rl_auth_state' // Client-side UX throttle only; Firebase Auth enforces abuse controls.
};
