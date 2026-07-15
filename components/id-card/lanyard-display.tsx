"use client"

import dynamic from "next/dynamic"
import { useCallback, useState } from "react"
import CardTemplate, { type CardVariant } from "@/components/card-template"
import { cn } from "@/lib/utils"

const Lanyard = dynamic(() => import("@/components/ui/lanyard"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full min-h-[520px] items-center justify-center bg-secondary px-6 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
      Loading 3D credential
    </div>
  ),
})

export interface LanyardDisplayProps {
  name: string
  department?: string
  role?: string
  status?: string
  variant?: CardVariant
  position?: [number, number, number]
  containerClassName?: string
  /** Accepted for API compatibility; the reference lanyard is always draggable. */
  interactive?: boolean
}

/**
 * Display-only 3D credential: renders the reference lanyard with a card face
 * composited from the given identity. No editing or sharing controls.
 */
export function LanyardDisplay({
  name,
  department,
  role,
  status,
  variant = "dark",
  position = [0, 0, 20],
  containerClassName,
}: LanyardDisplayProps) {
  const [cardTextureUrl, setCardTextureUrl] = useState<string | undefined>(undefined)
  const [textureKey, setTextureKey] = useState(0)

  const handleTextureReady = useCallback((dataUrl: string) => {
    setCardTextureUrl(dataUrl)
    setTextureKey((key) => key + 1)
  }, [])

  return (
    <div
      className={cn("relative size-full min-h-[520px]", containerClassName)}
      aria-label={`3D lab credential for ${name}`}
      role="img"
    >
      <span className="sr-only">
        Lab credential presentation for {name}
        {department ? `, ${department}` : ""}
        {role ? `, ${role}` : ""}
        {status ? `, account status ${status}` : ""}.
      </span>
      {/* CardTemplate composites the card face and fires handleTextureReady when ready. */}
      <CardTemplate
        userName={name}
        variant={variant}
        onTextureReady={handleTextureReady}
        subtitle={department}
        meta={role}
      />
      {cardTextureUrl ? (
        <Lanyard
          key={textureKey}
          position={position}
          containerClassName="size-full"
          cardTextureUrl={cardTextureUrl}
        />
      ) : (
        <div className="flex size-full min-h-[520px] items-center justify-center bg-secondary px-6 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Preparing 3D credential
        </div>
      )}
    </div>
  )
}

export type { CardVariant }
