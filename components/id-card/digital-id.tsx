"use client"

import dynamic from "next/dynamic"
import { Printer, ShieldCheck, Wifi } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import type { Profile } from "@/lib/types"

const LanyardWithControls = dynamic(() => import("@/components/lanyard-with-controls"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[520px] items-center justify-center bg-secondary font-mono text-xs uppercase text-muted-foreground">
      Loading 3D credential
    </div>
  ),
})

const STATUS_LABELS: Record<Profile["status"], string> = {
  active: "Access active",
  pending_approval: "Pending approval",
  suspended: "Suspended",
}

function credentialCode(profile: Profile): string {
  if (profile.register_number) return profile.register_number.toUpperCase()
  return `${profile.role.slice(0, 3).toUpperCase()}-${profile.id.slice(0, 6).toUpperCase()}`
}

export function DigitalId() {
  const { profile } = useAuth()
  if (!profile) return null

  const code = credentialCode(profile)
  const statusLabel = STATUS_LABELS[profile.status]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Identity / trusted profile
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Digital lab credential</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            A presentation layer for your lab identity. Access decisions remain server-authoritative.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer data-icon="inline-start" />
            Print
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <div className="credential-print-surface relative aspect-[0.64] max-h-[620px] overflow-hidden rounded-2xl border bg-primary p-7 text-primary-foreground shadow-2xl shadow-foreground/10">
            <div className="absolute inset-x-0 top-0 h-2 bg-status-active" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.2em]">Fabrication Lab</span>
              <Wifi className="size-5" />
            </div>
            <div className="mt-24">
              <p className="font-mono text-xs uppercase text-primary-foreground/60">Authorized identity</p>
              <h3 className="mt-3 text-balance text-4xl font-semibold">{profile.full_name}</h3>
              <p className="mt-2 text-primary-foreground/70">{profile.department}</p>
            </div>
            <div className="absolute inset-x-7 bottom-7">
              <div className="mb-6 grid grid-cols-2 gap-4 border-y border-primary-foreground/20 py-5 font-mono text-xs">
                <div>
                  <p className="text-primary-foreground/60">Credential</p>
                  <p className="mt-1">{code}</p>
                </div>
                <div>
                  <p className="text-primary-foreground/60">Access class</p>
                  <p className="mt-1 uppercase">{profile.role}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">
                  <ShieldCheck data-icon="inline-start" />
                  {statusLabel}
                </Badge>
                <span className="font-mono text-[10px]">NOT VALID FOR ACCESS</span>
              </div>
            </div>
          </div>
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Accessible credential</CardTitle>
              <CardDescription>The same verified fields without animation or WebGL.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p>{profile.full_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Role</p>
                <p className="capitalize">{profile.role}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Department</p>
                <p>{profile.department}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p>{statusLabel}</p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="min-h-[620px] overflow-hidden rounded-2xl border bg-secondary print:hidden">
          <LanyardWithControls
            defaultName={profile.full_name}
            subtitle={profile.department}
            meta={profile.role}
            containerClassName="relative h-[620px] w-full select-none"
          />
        </div>
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground print:hidden">
        This presentation is not an offline access token and does not grant machine access by itself. Account status, role,
        training, bookings, and privileged operations remain subject to live server checks.
      </p>
    </div>
  )
}
