import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

interface SourceFile {
  path: string
  source: string
}

function collectSourceFiles(directory: URL): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory)
    if (entry.isDirectory()) return collectSourceFiles(path)
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) return []
    return [{ path: path.pathname, source: readFileSync(path, "utf8") }]
  })
}

describe("frontend sharing policy", () => {
  it("contains no public-link, Web Share, LinkedIn, or X/Twitter implementation", () => {
    const prohibitedSharing = /linkedin|twitter|https?:\/\/(?:www\.)?x\.com|navigator\.share|navigator\.clipboard|clipboard\.writeText|copy link|share as link|\bshare\b/i
    const violations = [
      ...collectSourceFiles(new URL("../app/", import.meta.url)),
      ...collectSourceFiles(new URL("./", import.meta.url)),
    ]
      .filter(({ source }) => prohibitedSharing.test(source))
      .map(({ path }) => path)

    expect(violations).toEqual([])
  })
})
