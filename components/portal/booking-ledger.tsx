"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { CalendarDays, Check, RefreshCw, Search, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { addDays, formatTime, isFutureBooking, toLabDateString } from "@/lib/lab-time"
import type { Booking } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { bookingService } from "@/services/portal-service"

function statusVariant(status: Booking["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default"
  if (status === "pending") return "secondary"
  if (status === "cancelled") return "outline"
  return "destructive"
}

function CancelDialog({ busy, onCancel }: { busy: boolean; onCancel: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Cancel</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>Cancel this booking?</DialogTitle><DialogDescription>The server will mark the booking cancelled and release its slot locks. This action is recorded in the audit trail.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep booking</Button><Button variant="destructive" onClick={async () => { await onCancel(); setOpen(false) }} disabled={busy}>{busy ? "Cancelling…" : "Cancel booking"}</Button></DialogFooter></DialogContent>
    </Dialog>
  )
}

function ReviewDialog({ booking, decision, busy, onReview }: { booking: Booking; decision: "approved" | "rejected"; busy: boolean; onReview: (comments: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState("")
  const rejecting = decision === "rejected"

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (rejecting && !comments.trim()) return
    await onReview(comments.trim())
    setOpen(false)
    setComments("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant={rejecting ? "outline" : "default"}>{rejecting ? <X /> : <Check />}{rejecting ? "Reject" : "Approve"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{rejecting ? "Reject" : "Approve"} booking request</DialogTitle><DialogDescription>{rejecting ? "A clear rejection reason is required and will be sent to the student." : "Approval is transactional and will only succeed if the future slot locks remain valid."}</DialogDescription></DialogHeader>
        <form id={`review-${decision}-${booking.id}`} onSubmit={submit} className="grid gap-2"><Label htmlFor={`comments-${decision}-${booking.id}`}>{rejecting ? "Rejection reason" : "Review comments (optional)"}</Label><Textarea id={`comments-${decision}-${booking.id}`} value={comments} onChange={(event) => setComments(event.target.value)} maxLength={1000} required={rejecting} /></form>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Back</Button><Button type="submit" form={`review-${decision}-${booking.id}`} variant={rejecting ? "destructive" : "default"} disabled={busy || (rejecting && !comments.trim())}>{busy ? "Submitting…" : `Confirm ${decision === "approved" ? "approval" : "rejection"}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BookingLedger() {
  const { profile, canReviewBookings } = useAuth()
  const today = toLabDateString()
  const [dateFrom, setDateFrom] = useState(addDays(today, -365))
  const [dateTo, setDateTo] = useState(addDays(today, 90))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const result = await bookingService.getBookings({ date_from: dateFrom, date_to: dateTo })
    if (result.error) setError(result.error.message)
    else setBookings(result.data)
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const mutate = async (booking: Booking, action: "cancel" | "approved" | "rejected", comments = "") => {
    setBusyId(booking.id)
    const result = action === "cancel"
      ? await bookingService.cancelBooking(booking.id)
      : await bookingService.reviewBooking(booking.id, action, comments)
    setBusyId("")
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    toast.success(action === "cancel" ? "Booking cancelled." : `Booking ${action}.`)
    await load()
  }

  const matching = useMemo(() => {
    const needle = query.toLowerCase().trim()
    return bookings.filter((booking) => `${booking.id} ${booking.machines?.name ?? ""} ${booking.profiles?.full_name ?? ""} ${booking.purpose} ${booking.booking_date}`.toLowerCase().includes(needle))
  }, [bookings, query])

  const tabs = [
    { value: "all", label: "All", records: matching },
    { value: "pending", label: "Pending", records: matching.filter((item) => item.status === "pending") },
    { value: "approved", label: "Approved", records: matching.filter((item) => item.status === "approved") },
    { value: "closed", label: "Closed", records: matching.filter((item) => item.status === "rejected" || item.status === "cancelled") },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 border-b pb-8 sm:flex-row sm:items-end"><div><p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Booking ledger / server-backed</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Equipment time</h2><p className="mt-2 max-w-2xl text-muted-foreground">Track requests and decisions. Mutations are validated transactionally and recorded in the audit log.</p></div><Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh bookings"><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div>
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]"><div className="grid gap-2"><Label htmlFor="booking-from">From</Label><Input id="booking-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="booking-to">To</Label><Input id="booking-to" type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} /></div><Button className="self-end" onClick={() => void load()} disabled={loading || dateFrom > dateTo}>Apply range</Button></div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      <Tabs defaultValue="all">
        <div className="flex flex-col justify-between gap-3 sm:flex-row"><TabsList className="h-auto flex-wrap">{tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value}>{tab.label} ({tab.records.length})</TabsTrigger>)}</TabsList><div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ledger" className="pl-9" /></div></div>
        {tabs.map((tab) => <TabsContent key={tab.value} value={tab.value}><Card><CardHeader><CardTitle>{tab.label} activity</CardTitle><CardDescription>Showing up to 200 records returned for {dateFrom} through {dateTo}.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{loading && bookings.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Loading bookings…</p> : tab.records.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No matching bookings.</p> : tab.records.map((booking) => (
          <div key={booking.id} className="flex flex-col gap-4 rounded-lg border p-4 transition-colors hover:bg-secondary/30 lg:flex-row lg:items-center"><div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-secondary"><CalendarDays /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{booking.machines?.name ?? "Machine record"}</p><Badge variant={statusVariant(booking.status)}>{booking.status}</Badge></div><p className="mt-1 font-mono text-xs text-muted-foreground">{booking.id} / {booking.booking_date} / {formatTime(booking.start_time)}–{formatTime(booking.end_time)}</p>{canReviewBookings && <p className="mt-1 text-xs text-muted-foreground">Requested by {booking.profiles?.full_name ?? booking.student_id}</p>}<p className="mt-2 text-sm text-muted-foreground">{booking.purpose}</p>{booking.faculty_comments && <p className="mt-2 rounded-md bg-secondary p-2 text-xs">Review note: {booking.faculty_comments}</p>}</div><div className="flex flex-wrap gap-2">{profile?.role === "student" && ["pending", "approved"].includes(booking.status) && isFutureBooking(booking) && <CancelDialog busy={busyId === booking.id} onCancel={() => mutate(booking, "cancel")} />}{canReviewBookings && booking.status === "pending" && isFutureBooking(booking) && <><ReviewDialog booking={booking} decision="rejected" busy={busyId === booking.id} onReview={(comments) => mutate(booking, "rejected", comments)} /><ReviewDialog booking={booking} decision="approved" busy={busyId === booking.id} onReview={(comments) => mutate(booking, "approved", comments)} /></>}</div></div>
        ))}</CardContent></Card></TabsContent>)}
      </Tabs>
    </div>
  )
}
