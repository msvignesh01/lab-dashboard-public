import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(new URL("./marketing-site.tsx", import.meta.url), "utf8")

describe("public marketing site", () => {
  it("is a read-only entry surface without profile editing or sharing controls", () => {
    expect(source).not.toMatch(/<(?:Input|Textarea|select)\b/i)
    expect(source).not.toMatch(/contentEditable/i)
    expect(source).not.toMatch(/linkedin|twitter|x\.com|navigator\.share|clipboard|\bshare(?:d|able)?\b/i)
    expect(source).not.toMatch(/window\.print|\bdownload\b|save card|personalize|\bapply\b/i)
    expect(source).toContain("<LanyardDisplay")
    expect(source).toContain('name="MAKE / 01"')
    expect(source).toContain("pointer-events-none")
    expect(source).toContain("interactive={false}")
    expect(source).toContain('href="/login"')
    expect(source).toContain('href="/signup"')
  })

  it("exposes the public lanyard studio route", () => {
    expect(existsSync(new URL("../../app/lanyard/page.tsx", import.meta.url))).toBe(true)
  })
})
