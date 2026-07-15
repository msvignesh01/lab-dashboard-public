const universityDomains = new Set([
  "btech.christuniversity.in",
  "christuniversity.in",
])

export function validateEmail(value: string): boolean {
  const email = value.trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false

  const [localPart, domain] = email.split("@")
  if (universityDomains.has(domain.toLowerCase())) {
    return localPart.length >= 2
      && localPart.length <= 50
      && /^[a-zA-Z0-9._-]+$/.test(localPart)
  }
  return true
}

export function validatePassword(value: string): boolean {
  return value.length >= 8
    && value.length <= 128
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /\d/.test(value)
    && /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
}

export function validatePhoneNumber(value: string): boolean {
  return /^\+?[\d\s\-()]{10,20}$/.test(value.trim())
}

export function validateFirestoreId(value: string): boolean {
  return value.length > 0
    && value.length <= 128
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !/^__.*__$/.test(value)
}

export function isSafeImageUrl(value: string): boolean {
  if (!value) return true
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

export function toSafeMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}
