"use client"

import { Printer, ShieldCheck, Wifi } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatLabDateTime } from "@/lib/lab-time"
import { useAuth } from "@/hooks/use-auth"

export function DigitalId() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-end">
        <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Identity / authenticated profile</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Digital lab identity</h2><p className="mt-2 max-w-2xl text-muted-foreground">A read-only presentation of the profile loaded from the trusted server. Every operational decision is still re-authorized by the API.</p></div>
        <Button variant="outline" onClick={() => window.print()}><Printer />Print</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="relative aspect-[0.64] max-h-[620px] overflow-hidden rounded-2xl border bg-primary p-7 text-primary-foreground shadow-2xl shadow-foreground/10">
          <div className="absolute inset-x-0 top-0 h-2 bg-status-active" />
          <div className="flex items-center justify-between"><span className="font-mono text-xs uppercase tracking-[0.2em]">Fabrication Lab</span><Wifi className="size-5" /></div>
          <div className="mt-24"><p className="font-mono text-xs uppercase text-primary-foreground/60">Authenticated identity</p><h3 className="mt-3 text-balance text-4xl font-semibold">{profile.full_name}</h3><p className="mt-2 text-primary-foreground/70">{profile.department}</p></div>
          <div className="absolute inset-x-7 bottom-7"><div className="mb-6 grid grid-cols-2 gap-4 border-y border-primary-foreground/20 py-5 font-mono text-xs"><div><p className="text-primary-foreground/60">Profile reference</p><p className="mt-1 truncate" title={profile.id}>{profile.id.slice(0, 12)}…</p></div><div><p className="text-primary-foreground/60">Access role</p><p className="mt-1 uppercase">{profile.role}</p></div></div><div className="flex items-center justify-between"><Badge variant="secondary"><ShieldCheck />{profile.status}</Badge><span className="font-mono text-[10px]">SERVER / VERIFIED</span></div></div>
        </div>
        <div className="flex flex-col gap-4">
          <Card><CardHeader><CardTitle>Verified fields</CardTitle><CardDescription>These values are read from the authenticated account profile and cannot be changed by switching client state.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><IdentityField label="Name" value={profile.full_name} /><IdentityField label="Email" value={profile.email} /><IdentityField label="Role" value={profile.role} /><IdentityField label="Department" value={profile.department} /><IdentityField label="Account status" value={profile.status} /><IdentityField label="Profile updated" value={formatLabDateTime(profile.updated_at)} />{profile.register_number && <IdentityField label="Register number" value={profile.register_number} />}{profile.specialization && <IdentityField label="Specialization" value={profile.specialization} />}</CardContent></Card>
          <Card><CardHeader><CardTitle>Important</CardTitle><CardDescription>This screen is not a signed, shareable, or offline credential. It does not grant access by itself. Machine bookings, training, role, account status, and every privileged action are checked again by the server.</CardDescription></CardHeader></Card>
        </div>
      </div>
    </div>
  )
}

function IdentityField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium capitalize">{value}</p></div>
}
