"use client"

import { LanyardEditor } from "@/components/id-card/lanyard-editor"
import { useAuth } from "@/hooks/use-auth"

export function DigitalId() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Identity / authenticated profile
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Digital lab credential
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Customize, save, or print your 3D credential inside the secure portal. The card is a presentation of trusted profile data; every access decision is still re-authorized by the server.
        </p>
      </div>

      <LanyardEditor profile={profile} />

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground print:hidden">
        This presentation is not an offline access token and does not grant machine access by itself. Account status, role, training, bookings, and privileged operations remain subject to live server checks.
      </p>
    </div>
  )
}
