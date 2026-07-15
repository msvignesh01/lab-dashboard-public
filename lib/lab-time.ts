import { LAB_TIMEZONE } from "./constants"

function partsFor(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { year: values.year, month: values.month, day: values.day }
}

export function toLabDateString(date = new Date()): string {
  const { year, month, day } = partsFor(date)
  return `${year}-${month}-${day}`
}

export function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formatLabDateTime(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: LAB_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function formatTime(value?: string | null): string {
  if (!value) return "—"
  return value.slice(0, 5)
}

export function isFutureBooking(booking: { booking_date: string; start_time: string }): boolean {
  const today = toLabDateString()
  if (booking.booking_date !== today) return booking.booking_date > today

  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date())
  const values = Object.fromEntries(nowParts.map((part) => [part.type, part.value]))
  const currentTime = `${values.hour}:${values.minute}`
  return booking.start_time.slice(0, 5) > currentTime
}
