"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import {
  credentialTextureDataUrl,
  type CardVariant,
  type CredentialArtwork,
} from "@/components/id-card/credential-texture"
import { cn } from "@/lib/utils"

const LanyardScene = dynamic(() => import("@/components/id-card/lanyard-scene"), {
  ssr: false,
  loading: () => <SceneStatus>Loading 3D credential</SceneStatus>,
})

export interface LanyardDisplayProps {
  name: string
  department?: string
  role?: string
  status?: string
  variant?: CardVariant
  position?: [number, number, number]
  containerClassName?: string
  interactive?: boolean
}

export function LanyardDisplay({
  name,
  department = "Fabrication Lab",
  role = "Member",
  status = "Verified",
  variant = "dark",
  position,
  containerClassName,
  interactive = true,
}: LanyardDisplayProps) {
  const artwork = useMemo<CredentialArtwork>(() => ({
    displayName: name,
    department,
    role,
    status,
    variant,
  }), [department, name, role, status, variant])
  const [textureUrl, setTextureUrl] = useState<string | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTextureUrl(credentialTextureDataUrl(artwork))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [artwork])

  return (
    <div
      className={cn("relative size-full min-h-[520px]", containerClassName)}
      aria-label={`3D lab profile card for ${name}`}
      role="img"
    >
      <span className="sr-only">
        Lab profile presentation for {name}, {department}, {role}, account status {status}.
      </span>
      {textureUrl ? (
        <LanyardScene
          containerClassName="size-full"
          interactive={interactive}
          position={position}
          textureUrl={textureUrl}
        />
      ) : (
        <SceneStatus>Preparing 3D credential</SceneStatus>
      )}
    </div>
  )
}

function SceneStatus({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full min-h-[520px] items-center justify-center bg-secondary px-6 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

export type { CardVariant }
