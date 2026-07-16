"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, CalendarClock, CircleGauge, Clock3, GraduationCap, RefreshCw, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Reveal } from "@/components/motion/reveal"
import { addDays, formatTime, toLabDateString } from "@/lib/lab-time"
import type { Booking, LabConfig, Machine, TrainingRecord } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { bookingService, labConfigService, machineService, trainingService } from "@/services/portal-service"

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"><CardHeader><CardDescription className="font-mono uppercase tracking-wider">{label}</CardDescription><CardTitle className="text-4xl">{value}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{detail}</p></CardContent></Card>
}

function statusVariant(status: Booking["status"]): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default"
  if (status === "pending") return "secondary"
  return "destructive"
}

export function RoleDashboard() {
  const { profile, canReviewBookings } = useAuth()
  const [machines, setMachines] = useState<Machine[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [training, setTraining] = useState<TrainingRecord[]>([])
  const [config, setConfig] = useState<LabConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError("")
    const today = toLabDateString()
    const [machineResult, bookingResult, trainingResult, configResult] = await Promise.all([
      machineService.getMachines(),
      bookingService.getBookings({ date_from: today, date_to: addDays(today, 30) }),
      trainingService.getRecords(canReviewBookings ? {} : { student_id: profile.id }),
      labConfigService.getConfig(),
    ])
    const firstError = machineResult.error || bookingResult.error || trainingResult.error || configResult.error
    if (firstError) setError(firstError.message)
    if (machineResult.data) setMachines(machineResult.data)
    if (bookingResult.data) setBookings(bookingResult.data)
    if (trainingResult.data) setTraining(Array.isArray(trainingResult.data) ? trainingResult.data : trainingResult.data ? [trainingResult.data] : [])
    if (configResult.data) setConfig(configResult.data)
    setLoading(false)
  }, [canReviewBookings, profile])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const activeMachines = machines.filter((machine) => machine.is_active)
  const pendingBookings = bookings.filter((booking) => booking.status === "pending")
  const approvedBookings = bookings.filter((booking) => booking.status === "approved")
  const activeTraining = training.filter((record) => record.status === "active")
  const visibleBookings = useMemo(() => (canReviewBookings ? pendingBookings : bookings).slice(0, 5), [bookings, canReviewBookings, pendingBookings])

  if (!profile) return null

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Authenticated / {profile.role}</p>
          <h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">Make physical ideas real, safely.</h2>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">Welcome back, {profile.full_name}. This overview reflects the current server-authoritative lab records available to your role.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh overview"><RefreshCw className={loading ? "animate-spin" : ""} /></Button><Button asChild><Link href={profile.role === "student" ? "/portal/machines" : "/portal/operations"}>{profile.role === "student" ? "Book a machine" : "Open operations"}<ArrowRight /></Link></Button></div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button></div>}

      <section aria-busy={loading}>
        <Reveal as="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" triggerOnView>
          <Metric label="Active machines" value={loading ? "—" : String(activeMachines.length).padStart(2, "0")} detail={`${machines.length} visible to your role`} />
          <Metric label={canReviewBookings ? "Pending review" : "Upcoming approved"} value={loading ? "—" : String(canReviewBookings ? pendingBookings.length : approvedBookings.length).padStart(2, "0")} detail="within the next 30 days" />
          <Metric label="Training approvals" value={loading ? "—" : String(activeTraining.length).padStart(2, "0")} detail={canReviewBookings ? "active records in current result" : "active machine qualifications"} />
          <Metric label="Booking window" value={config ? `${config.max_advance_days}d` : "—"} detail={config ? `${formatTime(config.open_time)}–${formatTime(config.close_time)} lab hours` : "Loading policy"} />
        </Reveal>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{canReviewBookings ? "Booking review queue" : "Your upcoming sessions"}</CardTitle><CardDescription>{canReviewBookings ? "Pending requests requiring a faculty or administrator decision." : "Approved and pending equipment requests in the next 30 days."}</CardDescription></div><CalendarClock /></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!loading && visibleBookings.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No matching bookings.</p>}
            {visibleBookings.map((booking) => (
              <div key={booking.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary"><Clock3 className="size-4" /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{booking.machines?.name ?? "Machine record"}</p><p className="font-mono text-xs text-muted-foreground">{booking.booking_date} / {formatTime(booking.start_time)}–{formatTime(booking.end_time)}{booking.profiles?.full_name ? ` / ${booking.profiles.full_name}` : ""}</p></div>
                <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
              </div>
            ))}
          </CardContent>
          <CardFooter><Button asChild variant="ghost"><Link href="/portal/bookings">Open booking ledger<ArrowRight /></Link></Button></CardFooter>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="bg-primary text-primary-foreground"><CardHeader><ShieldCheck /><CardTitle>Account active</CardTitle><CardDescription className="text-primary-foreground/70">Verified {profile.role} profile</CardDescription></CardHeader><CardFooter><Button asChild variant="secondary"><Link href="/portal/id-card">Open identity view<ArrowRight /></Link></Button></CardFooter></Card>
          <Card><CardHeader><GraduationCap /><CardTitle>Training records</CardTitle><CardDescription>{activeTraining.length} active approval{activeTraining.length === 1 ? "" : "s"} visible to this account.</CardDescription></CardHeader><CardFooter>{canReviewBookings ? <Button asChild variant="outline"><Link href="/portal/training">Manage training</Link></Button> : <p className="text-xs text-muted-foreground">Training-required machines remain unavailable until an active record exists.</p>}</CardFooter></Card>
          {profile.role === "admin" && <Card><CardHeader><CircleGauge /><CardTitle>Administration</CardTitle><CardDescription>User, settings, and audit controls are available from the navigation.</CardDescription></CardHeader></Card>}
        </div>
      </section>
    </div>
  )
}
