import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const digitalIdSource = readFileSync(new URL("./digital-id.tsx", import.meta.url), "utf8")
const displaySource = readFileSync(new URL("./lanyard-display.tsx", import.meta.url), "utf8")
const controlsSource = readFileSync(new URL("../lanyard-with-controls.tsx", import.meta.url), "utf8")
const cardTemplateSource = readFileSync(new URL("../card-template.tsx", import.meta.url), "utf8")
const globalStyles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")

describe("digital ID credential", () => {
  it("renders the real authenticated profile, not mock data", () => {
    expect(digitalIdSource).toContain("useAuth()")
    expect(digitalIdSource).toContain("profile.full_name")
    expect(digitalIdSource).not.toMatch(/roleDetails|portal-data/)
  })

  it("does not offer social sharing on the credential", () => {
    expect(`${digitalIdSource}\n${controlsSource}\n${displaySource}`).not.toMatch(
      /linkedin|twitter|x\.com|navigator\.share|clipboard|copy link/i,
    )
  })

  it("keeps only variant + export controls on the lanyard (no share block)", () => {
    expect(controlsSource).toContain("Export as PNG")
    expect(controlsSource).not.toMatch(/Share|encryptLanyardData/)
  })

  it("renders a lab-branded card face with no v0/event artwork", () => {
    expect(cardTemplateSource).toContain("FABRICATION")
    expect(cardTemplateSource).not.toMatch(/card-base|guadalajara|new york|prompt to production|attendee/i)
  })

  it("marks the credential as a presentation, not an access token", () => {
    expect(digitalIdSource).toContain("NOT VALID FOR ACCESS")
  })

  it("prints only the credential surface", () => {
    expect(digitalIdSource).toContain("credential-print-surface")
    expect(globalStyles).toMatch(/@media print[\s\S]*\.credential-print-surface/)
  })

  it("ships the reference credential model with the expected geometry", () => {
    const model = readFileSync(new URL("../../public/card.glb", import.meta.url))
    expect(model.readUInt32LE(0)).toBe(0x46546c67)
    expect(model.readUInt32LE(4)).toBe(2)
    const jsonLength = model.readUInt32LE(12)
    const json = JSON.parse(model.subarray(20, 20 + jsonLength).toString("utf8").trim())
    expect(json.nodes.map((node: { name?: string }) => node.name)).toEqual(
      expect.arrayContaining(["card", "clip", "clamp"]),
    )
  })
})
