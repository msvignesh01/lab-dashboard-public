"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Box, CalendarPlus, MapPin, RefreshCw, Search, ShieldAlert, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { LAB_TIMEZONE } from "@/lib/constants"
import { Reveal } from "@/components/motion/reveal"
import { addDays, formatTime, toLabDateString } from "@/lib/lab-time"
import type { AvailabilityInterval, Machine, MachineAvailability } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { bookingService, machineService } from "@/services/portal-service"

const BOOKING_STEP_MINUTES = 15

function parseMinute(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : Number.NaN
}

function minuteToTime(minute: number): string {
  const hours = Math.floor(minute / 60).toString().padStart(2, "0")
  const minutes = (minute % 60).toString().padStart(2, "0")
  return `${hours}:${minutes}:00`
}

function currentLabMinute(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Number(values.hour) * 60 + Number(values.minute)
}

function intervalContaining(intervals: AvailabilityInterval[], minute: number): AvailabilityInterval | undefined {
  return intervals.find((interval) => minute >= interval.start_minute && minute < interval.end_minute)
}

function SpecificationDialog({ machine }: { machine: Machine }) {
  const specifications = Object.entries(machine.specifications ?? {})
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost">View specification</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{machine.name}</DialogTitle>
          <DialogDescription>{machine.description || "No description has been provided."}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Department</dt><dd className="mt-1 text-sm">{machine.department || "—"}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1 text-sm">{machine.location || "—"}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Training</dt><dd className="mt-1 text-sm">{machine.requires_training ? "Required" : "Not required"}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Registry status</dt><dd className="mt-1 text-sm">{machine.is_active ? "Active" : "Inactive"}</dd></div>
          {specifications.map(([key, value]) => (
            <div key={key} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{key.replaceAll("_", " ")}</dt>
              <dd className="mt-1 break-words text-sm">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

function BookingDialog({ machine, onCreated }: { machine: Machine; onCreated: () => void | Promise<void> }) {
  const today = toLabDateString()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [purpose, setPurpose] = useState("")
  const [availability, setAvailability] = useState<MachineAvailability | null>(null)
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [createdId, setCreatedId] = useState("")

  useEffect(() => {
    if (!open || !date) return
    let active = true
    const timer = window.setTimeout(() => {
      setLoadingAvailability(true)
      setAvailability(null)
      setStartTime("")
      setEndTime("")
      setError("")
      void machineService.getAvailability(machine.id, date).then((result) => {
        if (!active) return
        if (result.error) setError(result.error.message)
        else setAvailability(result.data)
        setLoadingAvailability(false)
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [date, machine.id, open])

  const startOptions = useMemo(() => {
    if (!availability) return []
    const earliestToday = date === today
      ? Math.ceil((currentLabMinute() + 1) / BOOKING_STEP_MINUTES) * BOOKING_STEP_MINUTES
      : 0
    const options: number[] = []
    for (const interval of availability.available_intervals) {
      const first = Math.max(
        Math.ceil(interval.start_minute / BOOKING_STEP_MINUTES) * BOOKING_STEP_MINUTES,
        earliestToday,
      )
      for (let minute = first; minute + BOOKING_STEP_MINUTES <= interval.end_minute; minute += BOOKING_STEP_MINUTES) {
        options.push(minute)
      }
    }
    return options
  }, [availability, date, today])

  const endOptions = useMemo(() => {
    if (!availability || !startTime) return []
    const startMinute = parseMinute(startTime)
    const interval = intervalContaining(availability.available_intervals, startMinute)
    if (!interval) return []
    const maximum = Math.min(
      interval.end_minute,
      startMinute + availability.lab_config.max_duration_hours * 60,
    )
    const options: number[] = []
    for (let minute = startMinute + BOOKING_STEP_MINUTES; minute <= maximum; minute += BOOKING_STEP_MINUTES) {
      options.push(minute)
    }
    return options
  }, [availability, startTime])

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setDate(today)
      setStartTime("")
      setEndTime("")
      setPurpose("")
      setAvailability(null)
      setCreatedId("")
      setError("")
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!availability || !startTime || !endTime || !purpose.trim()) {
      setError("Select a valid start and end time, then describe the work.")
      return
    }
    const startMinute = parseMinute(startTime)
    const endMinute = parseMinute(endTime)
    const interval = intervalContaining(availability.available_intervals, startMinute)
    if (!interval || endMinute <= startMinute || endMinute > interval.end_minute) {
      setError("The selected time must remain inside one server-confirmed available interval.")
      return
    }
    if (endMinute - startMinute > availability.lab_config.max_duration_hours * 60) {
      setError(`Bookings cannot exceed ${availability.lab_config.max_duration_hours} hours.`)
      return
    }

    setSubmitting(true)
    setError("")
    const result = await bookingService.createBooking({
      machine_id: machine.id,
      booking_date: date,
      start_time: startTime,
      end_time: endTime,
      purpose: purpose.trim(),
    })
    setSubmitting(false)
    if (result.error) {
      setError(result.error.message)
      if (["booking_conflict", "slot_unavailable"].includes(result.error.code)) {
        const refreshed = await machineService.getAvailability(machine.id, date)
        if (refreshed.data) setAvailability(refreshed.data)
        setStartTime("")
        setEndTime("")
      }
      return
    }
    setCreatedId(result.data.id)
    toast.success("Booking request submitted for review.")
    void onCreated()
  }

  const maxDate = addDays(today, availability?.lab_config.max_advance_days ?? 30)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild><Button disabled={!machine.is_active}>Reserve<CalendarPlus /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createdId ? "Request received" : `Reserve ${machine.name}`}</DialogTitle>
          <DialogDescription>{createdId ? "The request is pending faculty or administrator review." : "Availability, training, maintenance, and lab policy are checked again by the server when you submit."}</DialogDescription>
        </DialogHeader>
        {createdId ? (
          <div className="rounded-lg border bg-secondary p-5"><p className="font-mono text-xs uppercase text-muted-foreground">Request / {createdId}</p><p className="mt-2 font-medium">Pending review</p></div>
        ) : (
          <form id={`booking-${machine.id}`} className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-2"><Label htmlFor={`date-${machine.id}`}>Date</Label><Input id={`date-${machine.id}`} type="date" min={today} max={maxDate} value={date} onChange={(event) => { setDate(event.target.value); setAvailability(null); setStartTime(""); setEndTime(""); setError("") }} required /></div>
            {loadingAvailability && <p className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Checking server availability…</p>}
            {availability && !availability.eligible && <div className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>Active machine-specific training approval is required before this machine can be booked.</p></div>}
            {availability?.eligible && (
              <>
                <div className="rounded-md border bg-secondary/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Server-confirmed intervals</p>
                  {availability.available_intervals.length === 0 ? <p className="mt-2 text-sm">No availability remains on this date.</p> : <p className="mt-2 font-mono text-sm">{availability.available_intervals.map((interval) => `${formatTime(interval.start_time)}–${formatTime(interval.end_time)}`).join(", ")}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>Start time</Label>
                    <Select value={startTime} onValueChange={(value) => { setStartTime(value); setEndTime(""); setError("") }} required>
                      <SelectTrigger><SelectValue placeholder="Select start" /></SelectTrigger>
                      <SelectContent><SelectGroup>{startOptions.map((minute) => <SelectItem key={minute} value={minuteToTime(minute)}>{formatTime(minuteToTime(minute))}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>End time</Label>
                    <Select value={endTime} onValueChange={setEndTime} disabled={!startTime} required>
                      <SelectTrigger><SelectValue placeholder="Select end" /></SelectTrigger>
                      <SelectContent><SelectGroup>{endOptions.map((minute) => <SelectItem key={minute} value={minuteToTime(minute)}>{formatTime(minuteToTime(minute))}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Times use 15-minute increments. Maximum duration: {availability.lab_config.max_duration_hours} hours.</p>
              </>
            )}
            <div className="flex flex-col gap-2"><Label htmlFor={`purpose-${machine.id}`}>Purpose</Label><Textarea id={`purpose-${machine.id}`} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Project, material, and intended outcome" maxLength={500} required /></div>
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </form>
        )}
        <DialogFooter>{!createdId && <Button type="submit" form={`booking-${machine.id}`} disabled={submitting || loadingAvailability || !availability?.eligible || !startTime || !endTime}>{submitting ? "Submitting…" : "Submit request"}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MachineCatalog() {
  const { profile } = useAuth()
  const [machines, setMachines] = useState<Machine[]>([])
  const [query, setQuery] = useState("")
  const [department, setDepartment] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const result = await machineService.getMachines()
    if (result.error) setError(result.error.message)
    else setMachines(result.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const departments = useMemo(() => [...new Set(machines.map((machine) => machine.department).filter(Boolean) as string[])].sort(), [machines])
  const visible = useMemo(() => machines.filter((machine) => {
    const text = `${machine.name} ${machine.description ?? ""} ${machine.department ?? ""} ${machine.location ?? ""} ${JSON.stringify(machine.specifications ?? {})}`.toLowerCase()
    return (department === "all" || machine.department === department) && text.includes(query.toLowerCase().trim())
  }), [department, machines, query])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-end">
        <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Equipment registry / server-backed</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Machine floor</h2><p className="mt-2 max-w-2xl text-muted-foreground">Find equipment, inspect its registered requirements, and check date-specific booking availability.</p></div>
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh machines"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
      </div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>Retry</Button></div>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search equipment" className="pl-9" aria-label="Search machines" /></div>
        <Select value={department} onValueChange={setDepartment}><SelectTrigger className="w-full sm:w-56"><SlidersHorizontal /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All departments</SelectItem>{departments.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      </div>
      {loading && machines.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Loading machine registry…</div> : visible.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No machines match these filters.</div> : (
        <Reveal as="div" className="grid gap-4 md:grid-cols-2" triggerOnView>
          {visible.map((machine) => (
            <Card key={machine.id} className="overflow-hidden transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex h-40 items-center justify-center border-b bg-secondary">
                {machine.image_url ? (
                  // Administrators may register an HTTPS image host; these are deliberately lazy and unproxied.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={machine.image_url} alt={`${machine.name} equipment`} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                ) : <Box className="size-16 stroke-[1] text-muted-foreground" />}
              </div>
              <CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{machine.name}</CardTitle><CardDescription>{machine.department || "Unassigned department"}</CardDescription></div><Badge variant={machine.is_active ? "default" : "destructive"}>{machine.is_active ? "active" : "inactive"}</Badge></div></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 font-mono text-xs"><div><p className="text-muted-foreground">Training</p><p className="mt-1">{machine.requires_training ? "Required" : "Not required"}</p></div><div><p className="text-muted-foreground">Record ID</p><p className="mt-1 truncate" title={machine.id}>{machine.id}</p></div><div className="col-span-2 flex items-center gap-2 text-muted-foreground"><MapPin className="size-3.5" />{machine.location || "Location not recorded"}</div></CardContent>
              <CardFooter className="justify-between"><SpecificationDialog machine={machine} />{profile?.role === "student" && <BookingDialog machine={machine} onCreated={load} />}</CardFooter>
            </Card>
          ))}
        </Reveal>
      )}
    </div>
  )
}
