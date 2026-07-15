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
  dark: { bg: "#0e0f0f", fg: "#f7f7f4", muted: "#8a8d8a", accent: "#54d89d", line: "#242b27" },
  light: { bg: "#f4f3ee", fg: "#151616", muted: "#5e625f", accent: "#168858", line: "#d8dad4" },
} as const;

function safeFilename(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

const CardTemplate = forwardRef<CardTemplateRef, CardTemplateProps>(
  ({ userName, variant, onTextureReady, subtitle, meta }, ref) => {
    const mounted = useRef(true);

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    // Draw a premium, lab-branded card face in the reference's dark editorial
    // style. Rendered from scratch so no v0/event artwork can appear.
    const drawCard = (ctx: CanvasRenderingContext2D) => {
      const p = palettes[variant];
      const S = CANVAS_SIZE;

      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, S, S);

      // Top status accent bar.
      ctx.fillStyle = p.accent;
      ctx.fillRect(0, 0, S, 20);

      // Faint diagonal line texture.
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2;
      for (let x = -S; x < S * 2; x += 96) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + S, S);
        ctx.stroke();
      }
      ctx.restore();

      // Wordmark, top-left.
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = p.fg;
      ctx.font = '700 84px "Geist", ui-sans-serif, sans-serif';
      ctx.fillText("FABRICATION", 110, 210);
      ctx.fillText("LAB", 110, 300);
      ctx.fillStyle = p.muted;
      ctx.font = '500 27px "Geist Mono", ui-monospace, monospace';
      ctx.fillText("ADDITIVE SYSTEMS", 112, 352);

      // Credential identity. Anchored at the reference's proven text position
      // (right-aligned to the horizontal centre) so it maps to the visible face.
      const anchorX = S / 2 - 55;
      if (subtitle) {
        ctx.textAlign = "right";
        ctx.fillStyle = p.muted;
        ctx.font = '600 34px "Geist Mono", ui-monospace, monospace';
        ctx.fillText(subtitle.toUpperCase(), anchorX, S - 470);
      }

      const name = (userName || "YOUR NAME").toUpperCase();
      const nameSize = fitFont(ctx, name, anchorX - 60, 104, 46);
      ctx.textAlign = "right";
      ctx.fillStyle = p.fg;
      ctx.font = `700 ${nameSize}px "Geist", ui-sans-serif, sans-serif`;
      ctx.fillText(name, anchorX, S - 390);

      if (meta) {
        ctx.textAlign = "right";
        ctx.fillStyle = p.muted;
        ctx.font = '600 30px "Geist Mono", ui-monospace, monospace';
        ctx.fillText(meta.toUpperCase(), anchorX, S - 330);
      }

      // Anti-spoof footer.
      ctx.textAlign = "right";
      ctx.fillStyle = p.muted;
      ctx.font = '500 24px "Geist Mono", ui-monospace, monospace';
      ctx.fillText("NOT VALID FOR ACCESS", anchorX, S - 250);
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
      // Wait for the Geist webfonts so the card renders with the right type.
      try {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      } catch {
        // Font loading is best-effort; fall back to the system stack.
      }
      if (!mounted.current) return;
      const dataUrl = renderToDataUrl();
      if (dataUrl) onTextureReady(dataUrl);
    };

    // Auto-generate the card face on mount and whenever the (applied) content
    // changes, so the parent always has our composite before mounting the 3D.
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

CardTemplate.displayName = "CardTemplate";

export default CardTemplate;
