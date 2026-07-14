import { describe, expect, it } from "vitest"
import { addDays, formatTime } from "./lab-time"

describe("lab date helpers", () => {
  it("adds days without depending on the browser timezone", () => {
    expect(addDays("2026-07-15", 1)).toBe("2026-07-16")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("normalizes stored server times for display", () => {
    expect(formatTime("09:30:00")).toBe("09:30")
    expect(formatTime(null)).toBe("—")
  })
})
