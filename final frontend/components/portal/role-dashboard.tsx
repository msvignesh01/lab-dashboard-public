"use client"

import Link from "next/link"
import { ArrowRight, CalendarClock, Check, CircleGauge, Clock3, ShieldCheck, UserRoundCheck, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { bookings, machines, roleDetails } from "@/lib/portal-data"
import { usePortal } from "@/components/portal/portal-context"

const badgeVariant = (status: string) => status === "approved" || status === "available" ? "default" : status === "pending" || status === "in-use" ? "secondary" : "destructive"

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><CardHeader><CardDescription className="font-mono uppercase tracking-wider">{label}</CardDescription><CardTitle className="text-4xl">{value}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{detail}</p></CardContent></Card>
}

export function RoleDashboard() {
  const { role } = usePortal()
  const profile = roleDetails[role]
  const pending = bookings.filter((booking) => booking.status === "pending")

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-end">
        <div><p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Authenticated / {role}</p><h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">Make physical ideas real, safely.</h2><p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">Welcome back, {profile.name}. Your equipment, access, and active lab work are synchronized here.</p></div>
        <Button asChild><Link href="/portal/machines">Book a machine<ArrowRight data-icon="inline-end" /></Link></Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Available" value="03" detail="of 4 machines online" />
        <Metric label={role === "student" ? "Bookings" : "Approvals"} value={role === "student" ? "02" : String(pending.length).padStart(2, "0")} detail={role === "student" ? "scheduled this week" : "awaiting a decision"} />
        <Metric label="Training" value="84%" detail="core modules complete" />
        <Metric label="Lab load" value="62%" detail="moderate utilization" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{role === "student" ? "Your next sessions" : "Booking review queue"}</CardTitle><CardDescription>{role === "student" ? "Approved and pending equipment access." : "Requests requiring faculty action."}</CardDescription></div><CalendarClock /></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(role === "student" ? bookings.slice(0, 3) : pending).map((booking) => (
              <div key={booking.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary"><Clock3 className="size-4" /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{booking.machine}</p><p className="font-mono text-xs text-muted-foreground">{booking.date} / {booking.time} / {booking.owner}</p></div>
                <Badge variant={badgeVariant(booking.status)}>{booking.status}</Badge>
                {role !== "student" && <div className="flex gap-1"><Button size="icon" variant="outline" aria-label={`Reject ${booking.machine}`}><X /></Button><Button size="icon" aria-label={`Approve ${booking.machine}`}><Check /></Button></div>}
              </div>
            ))}
          </CardContent>
          <CardFooter><Button asChild variant="ghost"><Link href="/portal/bookings">Open booking ledger<ArrowRight data-icon="inline-end" /></Link></Button></CardFooter>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader><ShieldCheck /><CardTitle>Credential active</CardTitle><CardDescription className="text-primary-foreground/70">Digital lab ID · {profile.code}</CardDescription></CardHeader>
            <CardFooter><Button asChild variant="secondary"><Link href="/portal/id-card">Open ID card<ArrowRight data-icon="inline-end" /></Link></Button></CardFooter>
          </Card>
          <Card><CardHeader><CardTitle>Safety readiness</CardTitle><CardDescription>3 of 4 required modules current</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Progress value={84} /><div className="flex justify-between font-mono text-xs text-muted-foreground"><span>84% complete</span><span>Renews Sep 18</span></div></CardContent></Card>
        </div>
      </section>

      {role === "admin" && <section><Card><CardHeader><CardTitle>Administration signal</CardTitle><CardDescription>System-wide access, maintenance, and people operations.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><Button asChild variant="outline" className="justify-start"><Link href="/portal/users"><UserRoundCheck data-icon="inline-start" />Review users</Link></Button><Button asChild variant="outline" className="justify-start"><Link href="/portal/operations"><CircleGauge data-icon="inline-start" />Machine operations</Link></Button><Button asChild variant="outline" className="justify-start"><Link href="/portal/audit"><ShieldCheck data-icon="inline-start" />Audit access</Link></Button></CardContent></Card></section>}
    </div>
  )
}
