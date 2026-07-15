"use client"

import { useState } from "react"
import { Activity, AlertTriangle, Check, ClipboardCheck, History, ShieldCheck, UserCheck, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { bookings, machines } from "@/lib/portal-data"

const users = [
  { name: "Avery Morgan", role: "Student", department: "Industrial Design", access: "Active" },
  { name: "Mina Patel", role: "Student", department: "Architecture", access: "Training due" },
  { name: "Dr. Nora Chen", role: "Faculty", department: "Mechanical Engineering", access: "Active" },
]

export function OperationsWorkspace({ mode }: { mode: "operations" | "training" | "users" | "audit" | "settings" }) {
  const [resolved, setResolved] = useState<string[]>([])
  const title = { operations: "Operations control", training: "Training manager", users: "People and access", audit: "Audit log", settings: "Lab configuration" }[mode]
  const description = { operations: "Coordinate machine uptime, maintenance, and the daily floor schedule.", training: "Review practical qualifications and expiring safety credentials.", users: "Manage account roles, status, and facility eligibility.", audit: "Inspect immutable records of access and administrative actions.", settings: "Define booking windows, contact points, and operational defaults." }[mode]

  const rows = mode === "operations" ? machines.map((item) => ({ id: item.id, name: item.name, meta: `${item.location} · ${item.process}`, status: item.status })) : mode === "training" ? users.map((item, index) => ({ id: `tr-${index}`, name: item.name, meta: `${item.department} · Core fabrication safety`, status: index === 1 ? "review" : "current" })) : mode === "users" ? users.map((item, index) => ({ id: `us-${index}`, name: item.name, meta: `${item.role} · ${item.department}`, status: item.access })) : mode === "audit" ? bookings.map((item) => ({ id: item.id, name: `${item.owner} · ${item.machine}`, meta: `Booking status evaluated · ${item.date} ${item.time}`, status: item.status })) : [
    { id: "cfg-01", name: "Standard booking window", meta: "30 minutes minimum · 4 hours maximum", status: "active" },
    { id: "cfg-02", name: "Faculty approval", meta: "Required for SLS and metal workflows", status: "active" },
    { id: "cfg-03", name: "After-hours access", meta: "Disabled outside supervised projects", status: "restricted" },
  ]

  return <div className="flex flex-col gap-8"><div className="border-b pb-8"><p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Administration / {mode}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2><p className="mt-2 max-w-2xl text-muted-foreground">{description}</p></div><div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader><Activity /><CardDescription>System health</CardDescription><CardTitle>Nominal</CardTitle></CardHeader></Card><Card><CardHeader><AlertTriangle /><CardDescription>Needs attention</CardDescription><CardTitle>{mode === "training" ? "01" : "02"}</CardTitle></CardHeader></Card><Card><CardHeader><ShieldCheck /><CardDescription>Policy coverage</CardDescription><CardTitle>96%</CardTitle></CardHeader><CardContent><Progress value={96} /></CardContent></Card></div><Card><CardHeader><CardTitle>Current records</CardTitle><CardDescription>Actions below simulate the supplied approval and management workflows.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{rows.map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="flex size-10 items-center justify-center rounded-md bg-secondary">{mode === "audit" ? <History /> : mode === "users" ? <UserCheck /> : mode === "training" ? <ClipboardCheck /> : <Wrench />}</div><div className="min-w-0 flex-1"><p className="font-medium">{row.name}</p><p className="font-mono text-xs text-muted-foreground">{row.id} / {row.meta}</p></div><Badge variant={resolved.includes(row.id) ? "default" : row.status === "maintenance" || row.status === "restricted" ? "destructive" : "secondary"}>{resolved.includes(row.id) ? "resolved" : row.status}</Badge>{mode !== "audit" && <Button size="sm" variant="outline" onClick={() => setResolved((current) => [...current, row.id])} disabled={resolved.includes(row.id)}><Check data-icon="inline-start" />{resolved.includes(row.id) ? "Updated" : "Review"}</Button>}</div>)}</CardContent></Card></div>
}
