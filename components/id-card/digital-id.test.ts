import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { normalizeCardName } from "./credential-texture"

const digitalIdSource = readFileSync(new URL("./digital-id.tsx", import.meta.url), "utf8")
const editorSource = readFileSync(new URL("./lanyard-editor.tsx", import.meta.url), "utf8")
const displaySource = readFileSync(new URL("./lanyard-display.tsx", import.meta.url), "utf8")
const sceneSource = readFileSync(new URL("./lanyard-scene.tsx", import.meta.url), "utf8")
const textureSource = readFileSync(new URL("./credential-texture.ts", import.meta.url), "utf8")
const globalStyles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")

function readCardModelManifest() {
  const model = readFileSync(new URL("../../public/card.glb", import.meta.url))
  expect(model.readUInt32LE(0)).toBe(0x46546c67)
  expect(model.readUInt32LE(4)).toBe(2)
  const jsonLength = model.readUInt32LE(12)
  const json = model.subarray(20, 20 + jsonLength).toString("utf8").trim()
  return { json: JSON.parse(json), model }
}

describe("digital ID actions", () => {
  it("offers only authenticated edit, save, and print controls", () => {
    expect(digitalIdSource).toContain("<LanyardEditor profile={profile}")
    expect(editorSource).toContain("Apply edits")
    expect(editorSource).toContain("Save PNG")
    expect(editorSource).toContain("window.print()")
    expect(`${digitalIdSource}\n${editorSource}`).not.toMatch(
      /linkedin|twitter|x\.com|navigator\.share|clipboard|copy link/i,
    )
  })

  it("does not retain the static credential fallback", () => {
    expect(digitalIdSource).not.toMatch(/accessible credential|verified fields|without animation|without webgl/i)
    expect(digitalIdSource).not.toContain("aspect-[0.64]")
  })

  it("ships geometry-only credential model data", () => {
    const { json, model } = readCardModelManifest()
    expect(json.nodes.map((node: { name?: string }) => node.name)).toEqual(
      expect.arrayContaining(["card", "clip", "clamp"]),
    )
    expect(json.images).toBeUndefined()
    expect(json.textures).toBeUndefined()
    expect(model.includes(Buffer.from("Powered by Vercel"))).toBe(false)
    expect(model.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })

  it("keeps the WebGL scene idle when its physics bodies sleep", () => {
    expect(sceneSource).toContain('frameloop="demand"')
    expect(sceneSource).not.toContain('updateLoop="independent"')
    expect(sceneSource).toContain("preserveDrawingBuffer: interactive")
    expect(sceneSource).toMatch(/setAngvel\([\s\S]*?false\)/)
    expect(displaySource).not.toContain("key={textureUrl}")
  })

  it("marks saved and printed artwork as a non-access display", () => {
    expect(textureSource).toContain("USER-CUSTOMIZED PROFILE DISPLAY")
    expect(textureSource).toContain("NOT VALID FOR ACCESS")
    expect(textureSource).not.toContain("AUTHENTICATED IDENTITY")
    expect(textureSource).not.toContain("PRESENTATION / SERVER VERIFIED")
  })

  it("prints only the credential surface", () => {
    expect(editorSource).toContain("credential-print-surface")
    expect(globalStyles).toMatch(/@media print[\s\S]*\.credential-print-surface/)
    expect(globalStyles).toMatch(/\.credential-print-surface form[\s\S]*display: none !important/)
  })

  it("normalizes local presentation names", () => {
    expect(normalizeCardName("  Ada   Lovelace  ")).toBe("Ada Lovelace")
    expect(normalizeCardName("   ", "Lab member")).toBe("Lab member")
    expect(Array.from(normalizeCardName("x".repeat(80))).length).toBe(40)
    expect(textureSource).toContain('fillText(name.toUpperCase(), 112, 810, 1120)')
  })
})
