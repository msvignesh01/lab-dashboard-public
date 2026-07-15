export const DEPARTMENTS = [
  "CSE",
  "ECE",
  "EEE",
  "Mechanical",
  "Civil",
  "Chemical",
  "Biotechnology",
] as const

export const EMAIL_DOMAINS = {
  STUDENT: "@btech.christuniversity.in",
  FACULTY: "@christuniversity.in",
} as const

export const RATE_LIMIT = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000,
  STORAGE_KEY: "_rl_auth_state",
} as const

export const LAB_TIMEZONE = "Asia/Kolkata"

export const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const
