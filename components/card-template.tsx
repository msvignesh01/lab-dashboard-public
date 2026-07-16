"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type CardVariant = "dark" | "light";

interface CardTemplateProps {
  userName: string;
  variant: CardVariant;
  onTextureReady: (dataUrl: string) => void;
  subtitle?: string;
  meta?: string;
}

export interface CardTemplateRef {
  captureTexture: () => Promise<void>;
  exportCard: () => void;
}

const CANVAS_SIZE = 1376;

const palettes = {
  dark: { bg: "#0c0d0d", fg: "#f7f7f4", muted: "#8a8d8a", faint: "#4b4f4c", accent: "#54d89d", line: "#20241f", glow: "#171a17" },
  light: { bg: "#f4f3ee", fg: "#151616", muted: "#5e625f", faint: "#a7aaa4", accent: "#168858", line: "#dcded7", glow: "#ffffff" },
} as const;

function safeFilename(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "credential";
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, initial: number, min: number): number {
  let size = initial;
  while (size > min) {
    ctx.font = `700 ${size}px "Geist", ui-sans-serif, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

// Deterministic 8-hex-char id derived from the name, formatted as XXXX-XXXX.
function credentialId(seed: string): string {
  let h = 0x811c9dc5;
  const source = seed || "credential";
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

const CardTemplate = forwardRef<CardTemplateRef, CardTemplateProps>(
  ({ userName, variant, onTextureReady, subtitle, meta }, ref) => {
    const mounted = useRef(true);

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    // Draw a premium, lab-branded card face with reference-grade technical
    // density. Rendered from scratch — no v0/event artwork.
    const drawCard = (ctx: CanvasRenderingContext2D) => {
      const p = palettes[variant];
      const S = CANVAS_SIZE;
      const id = credentialId(userName);

      // Base + soft radial depth.
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, S, S);
      const grad = ctx.createRadialGradient(S * 0.72, S * 0.26, 40, S * 0.72, S * 0.26, S * 0.9);
      grad.addColorStop(0, p.glow);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha = variant === "dark" ? 0.6 : 0.5;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
      ctx.restore();

      // Fine engineering dot grid.
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = p.faint;
      for (let x = 96; x < S - 60; x += 52) {
        for (let y = 96; y < S - 60; y += 52) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Large technical concentric motif + crosshair (background).
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.faint;
      ctx.lineWidth = 2.5;
      const cx = S * 0.42;
      const cy = S * 0.46;
      for (const r of [96, 150, 210, 276]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 320, cy);
      ctx.lineTo(cx + 320, cy);
      ctx.moveTo(cx, cy - 320);
      ctx.lineTo(cx, cy + 320);
      ctx.stroke();
      ctx.restore();
      // Accent tick on the outer ring.
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, 276, -Math.PI / 2, -Math.PI / 2 + 0.55);
      ctx.stroke();
      ctx.restore();

      // Top status accent bar.
      ctx.fillStyle = p.accent;
      ctx.fillRect(0, 0, S, 20);

      // Wordmark, top-left.
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = p.fg;
      ctx.font = '700 82px "Geist", ui-sans-serif, sans-serif';
      ctx.fillText("FABRICATION", 110, 208);
      ctx.fillText("LAB", 110, 296);
      ctx.fillStyle = p.muted;
      ctx.font = '500 27px "Geist Mono", ui-monospace, monospace';
      ctx.fillText("ADDITIVE SYSTEMS", 112, 348);

      // Data-matrix block, top-right, with QR-style corner anchors.
      const mx = S - 110 - 168;
      const my = 120;
      const cells = 9;
      const cell = 168 / cells;
      let h = 0x2166;
      for (let i = 0; i < source(userName).length; i += 1) h = (Math.imul(h, 31) + source(userName).charCodeAt(i)) >>> 0;
      ctx.fillStyle = p.muted;
      for (let r = 0; r < cells; r += 1) {
        for (let c = 0; c < cells; c += 1) {
          h = (Math.imul(h, 1103515245) + 12345) >>> 0;
          if ((h >>> 9) % 100 < 46) ctx.fillRect(mx + c * cell + 1, my + r * cell + 1, cell - 2, cell - 2);
        }
      }
      // corner anchors
      ctx.fillStyle = p.fg;
      for (const [ax, ay] of [[mx, my], [mx + 168 - cell * 3, my], [mx, my + 168 - cell * 3]] as const) {
        ctx.fillRect(ax, ay, cell * 3, cell * 3);
        ctx.fillStyle = p.bg;
        ctx.fillRect(ax + cell, ay + cell, cell, cell);
        ctx.fillStyle = p.fg;
      }
      ctx.fillStyle = p.muted;
      ctx.font = '500 24px "Geist Mono", ui-monospace, monospace';
      ctx.textAlign = "right";
      ctx.fillText(`CRED ${id}`, S - 110, my + 168 + 40);

      // Credential identity, lower area (right-aligned to the reference anchor).
      const anchorX = S / 2 - 55;
      if (subtitle) {
        ctx.textAlign = "right";
        ctx.fillStyle = p.muted;
        ctx.font = '600 34px "Geist Mono", ui-monospace, monospace';
        ctx.fillText(subtitle.toUpperCase(), anchorX, S - 520);
      }

      const name = (userName || "YOUR NAME").toUpperCase();
      const nameSize = fitFont(ctx, name, anchorX - 40, 104, 46);
      ctx.textAlign = "right";
      ctx.fillStyle = p.fg;
      ctx.font = `700 ${nameSize}px "Geist", ui-sans-serif, sans-serif`;
      ctx.fillText(name, anchorX, S - 430);

      if (meta) {
        ctx.textAlign = "right";
        ctx.fillStyle = p.muted;
        ctx.font = '600 30px "Geist Mono", ui-monospace, monospace';
        ctx.fillText(meta.toUpperCase(), anchorX, S - 372);
      }

      // Hairline + mono data footer row.
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(110, S - 300);
      ctx.lineTo(anchorX, S - 300);
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = "left";
      ctx.fillStyle = p.muted;
      ctx.font = '500 24px "Geist Mono", ui-monospace, monospace';
      ctx.fillText("ISSUED 2026", 112, S - 258);
      ctx.textAlign = "right";
      ctx.fillText("NOT VALID FOR ACCESS", anchorX, S - 258);
    };

    const renderToDataUrl = (): string | null => {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      drawCard(ctx);
      return canvas.toDataURL("image/png");
    };

    const emitTexture = async () => {
      try {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      } catch {
        // Font loading is best-effort; fall back to the system stack.
      }
      if (!mounted.current) return;
      const dataUrl = renderToDataUrl();
      if (dataUrl) onTextureReady(dataUrl);
    };

    useEffect(() => {
      void emitTexture();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userName, variant, subtitle, meta]);

    const captureTexture = async () => {
      await emitTexture();
    };

    const exportCard = () => {
      const CROP_BOTTOM = 334;
      const EXPORT_HEIGHT = CANVAS_SIZE - CROP_BOTTOM;

      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = CANVAS_SIZE;
      fullCanvas.height = CANVAS_SIZE;
      const fullCtx = fullCanvas.getContext("2d");
      if (!fullCtx) return;
      drawCard(fullCtx);

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = CANVAS_SIZE;
      exportCanvas.height = EXPORT_HEIGHT;
      const exportCtx = exportCanvas.getContext("2d");
      if (!exportCtx) return;
      exportCtx.drawImage(fullCanvas, 0, 0, CANVAS_SIZE, EXPORT_HEIGHT, 0, 0, CANVAS_SIZE, EXPORT_HEIGHT);

      const dataUrl = exportCanvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      link.download = `fabrication-lab-${safeFilename(userName || "credential")}.png`;
      link.href = dataUrl;
      link.click();
    };

    useImperativeHandle(ref, () => ({
      captureTexture,
      exportCard,
    }));

    return null;
  },
);

function source(value: string): string {
  return value || "credential";
}

CardTemplate.displayName = "CardTemplate";

export default CardTemplate;
