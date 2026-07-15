export type CardVariant = "dark" | "light"

export interface CredentialArtwork {
  displayName: string
  department: string
  role: string
  status: string
  variant: CardVariant
}

export const MAX_CARD_NAME_LENGTH = 40

const CANVAS_SIZE = 1376

const palettes = {
  dark: {
    background: "#101111",
    foreground: "#f7f7f4",
    muted: "#a7aaa7",
    border: "#353837",
    accent: "#54d89d",
    panel: "#181a19",
  },
  light: {
    background: "#f5f4ef",
    foreground: "#151616",
    muted: "#5e625f",
    border: "#c8cbc6",
    accent: "#168858",
    panel: "#e9e9e3",
  },
} as const

export function normalizeCardName(value: string, fallback = "Lab member"): string {
  const normalized = value
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("")
    .replace(/\s+/g, " ")
    .trim()

  return Array.from(normalized || fallback).slice(0, MAX_CARD_NAME_LENGTH).join("")
}

export function createCredentialTexture(artwork: CredentialArtwork): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null

  const canvas = document.createElement("canvas")
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE

  const context = canvas.getContext("2d")
  if (!context) return null

  const palette = palettes[artwork.variant]
  const name = normalizeCardName(artwork.displayName)
  const department = normalizeLabel(artwork.department, "Fabrication Lab")
  const role = normalizeLabel(artwork.role, "Member")
  const status = normalizeLabel(artwork.status, "Verified")

  context.fillStyle = palette.background
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  context.fillStyle = palette.accent
  context.fillRect(0, 0, CANVAS_SIZE, 22)

  drawGrid(context, palette.border)

  context.strokeStyle = palette.border
  context.lineWidth = 2
  context.strokeRect(72, 72, CANVAS_SIZE - 144, CANVAS_SIZE - 144)

  context.fillStyle = palette.panel
  roundRect(context, 760, 154, 446, 446, 36)
  context.fill()

  context.strokeStyle = palette.border
  context.lineWidth = 2
  for (let index = 0; index < 7; index += 1) {
    const offset = index * 42
    context.beginPath()
    context.moveTo(810 + offset, 204)
    context.lineTo(810 + offset, 550)
    context.stroke()
    context.beginPath()
    context.moveTo(810, 204 + offset)
    context.lineTo(1156, 204 + offset)
    context.stroke()
  }

  context.fillStyle = palette.accent
  context.beginPath()
  context.arc(983, 377, 82, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = palette.background
  context.font = '700 44px "Geist Mono", ui-monospace, monospace'
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText("AML", 983, 377)

  context.textAlign = "left"
  context.textBaseline = "alphabetic"
  context.fillStyle = palette.foreground
  context.font = '700 48px "Geist", ui-sans-serif, sans-serif'
  context.fillText("FABRICATION LAB", 112, 176)
  context.fillStyle = palette.muted
  context.font = '500 25px "Geist Mono", ui-monospace, monospace'
  context.fillText("ADDITIVE MANUFACTURING OPERATIONS", 112, 220)

  context.fillStyle = palette.muted
  context.font = '600 24px "Geist Mono", ui-monospace, monospace'
  context.fillText("USER-CUSTOMIZED PROFILE DISPLAY", 112, 690)

  context.fillStyle = palette.foreground
  context.font = fitFont(context, name.toUpperCase(), 1120, 92, 34)
  context.fillText(name.toUpperCase(), 112, 810, 1120)

  context.strokeStyle = palette.border
  context.beginPath()
  context.moveTo(112, 872)
  context.lineTo(1264, 872)
  context.stroke()

  drawLabelValue(context, "DEPARTMENT", department, 112, 960, palette)
  drawLabelValue(context, "ACCESS ROLE", role, 670, 960, palette)

  context.fillStyle = palette.panel
  roundRect(context, 112, 1122, 400, 108, 22)
  context.fill()
  context.fillStyle = palette.accent
  context.beginPath()
  context.arc(158, 1176, 12, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = palette.foreground
  context.font = '650 26px "Geist Mono", ui-monospace, monospace'
  context.fillText(`ACCOUNT ${status.toUpperCase()}`, 190, 1185)

  context.fillStyle = palette.muted
  context.font = '500 22px "Geist Mono", ui-monospace, monospace'
  context.textAlign = "right"
  context.fillText("NOT VALID FOR ACCESS", 1264, 1185)

  return canvas
}

export function credentialTextureDataUrl(artwork: CredentialArtwork): string | null {
  return createCredentialTexture(artwork)?.toDataURL("image/png") ?? null
}

export async function downloadCredentialArtwork(
  artwork: CredentialArtwork,
  filename: string,
): Promise<void> {
  const canvas = createCredentialTexture(artwork)
  if (!canvas) throw new Error("Card artwork could not be created in this browser.")

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error("Card artwork could not be encoded."))
    }, "image/png")
  })

  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.download = `${safeFilename(filename)}-lab-card.png`
  link.href = objectUrl
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function normalizeLabel(value: string, fallback: string): string {
  return normalizeCardName(value, fallback).slice(0, MAX_CARD_NAME_LENGTH)
}

function safeFilename(value: string): string {
  const normalized = normalizeCardName(value, "member")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return normalized || "member"
}

function fitFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
): string {
  let size = initialSize
  while (size > minimumSize) {
    context.font = `700 ${size}px "Geist", ui-sans-serif, sans-serif`
    if (context.measureText(text).width <= maxWidth) break
    size -= 2
  }
  return `700 ${size}px "Geist", ui-sans-serif, sans-serif`
}

function drawGrid(context: CanvasRenderingContext2D, color: string) {
  context.save()
  context.globalAlpha = 0.32
  context.strokeStyle = color
  context.lineWidth = 1
  for (let offset = 72; offset <= CANVAS_SIZE - 72; offset += 72) {
    context.beginPath()
    context.moveTo(offset, 72)
    context.lineTo(offset, CANVAS_SIZE - 72)
    context.stroke()
  }
  context.restore()
}

function drawLabelValue(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  palette: (typeof palettes)[CardVariant],
) {
  context.textAlign = "left"
  context.fillStyle = palette.muted
  context.font = '600 21px "Geist Mono", ui-monospace, monospace'
  context.fillText(label, x, y)
  context.fillStyle = palette.foreground
  context.font = '650 34px "Geist", ui-sans-serif, sans-serif'
  context.fillText(value.toUpperCase(), x, y + 54, 500)
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}
