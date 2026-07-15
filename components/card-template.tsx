"use client";

import { forwardRef, useImperativeHandle, useEffect, useState } from "react";

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

function safeFilename(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "credential";
}

const CardTemplate = forwardRef<CardTemplateRef, CardTemplateProps>(
  ({ userName, variant, onTextureReady, subtitle, meta }, ref) => {
    const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);

    const imageSrc = variant === "dark" ? "/card-base-dark.png" : "/card-base-light.png";
    const textColor = variant === "dark" ? "#ffffff" : "#000000";

    // Preload the base card image
    useEffect(() => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setBaseImage(img);
      img.src = imageSrc;
    }, [imageSrc]);

    const drawCard = (ctx: CanvasRenderingContext2D) => {
      // Draw base card image (fills entire canvas)
      if (baseImage) {
        ctx.drawImage(baseImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      } else {
        // Fallback black background if image not loaded
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }

      // Draw user name in the lower name slot
      const displayName = userName || "YOUR NAME";
      ctx.fillStyle = textColor;
      ctx.font = 'normal 48px "Geist Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(displayName.toUpperCase(), CANVAS_SIZE / 2 - 55, CANVAS_SIZE - 400);

      // Upper subtitle slot (real department / lab context)
      if (subtitle) {
        ctx.fillStyle = textColor;
        ctx.font = 'normal 48px "Geist Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(subtitle.toUpperCase(), CANVAS_SIZE / 2 - 55, CANVAS_SIZE - 1226);
      }

      // Meta slot (real role / status), muted
      if (meta) {
        ctx.fillStyle = "#878787";
        ctx.font = 'normal 48px "Geist Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(meta.toUpperCase(), CANVAS_SIZE / 2 - 55, CANVAS_SIZE - 1170);
      }
    };

    const captureTexture = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      drawCard(ctx);

      const dataUrl = canvas.toDataURL("image/png");
      onTextureReady(dataUrl);
    };

    const exportCard = () => {
      const CROP_BOTTOM = 334;
      const EXPORT_HEIGHT = CANVAS_SIZE - CROP_BOTTOM;

      // First, create a full-size canvas to draw the complete card
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = CANVAS_SIZE;
      fullCanvas.height = CANVAS_SIZE;
      const fullCtx = fullCanvas.getContext("2d");
      if (!fullCtx) return;

      drawCard(fullCtx);

      // Create cropped export canvas (excludes bottom 334px)
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = CANVAS_SIZE;
      exportCanvas.height = EXPORT_HEIGHT;
      const exportCtx = exportCanvas.getContext("2d");
      if (!exportCtx) return;

      // Copy the top portion of the full canvas to the export canvas
      exportCtx.drawImage(
        fullCanvas,
        0, 0, CANVAS_SIZE, EXPORT_HEIGHT,
        0, 0, CANVAS_SIZE, EXPORT_HEIGHT,
      );

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

    // This component doesn't render anything visible
    return null;
  },
);

CardTemplate.displayName = "CardTemplate";

export default CardTemplate;
