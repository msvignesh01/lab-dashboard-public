"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { CalendarClock, Edit3, LoaderCircle, Plus, RefreshCw, Search, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Machine, MaintenanceWindow } from "@/lib/types"
import { machineService, maintenanceService } from "@/services/portal-service"
import { ConfirmActionDialog, formatPortalDateTime, InlineError, LoadingState, StatePanel } from "@/components/portal/admin/common"

type MaintenanceForm = {
  scope: "machine" | "global"
  machine_id: string
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  reason: string
}

function labToday(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
}

function initialForm(): MaintenanceForm {
  const today = labToday()
  return {
    scope: "machine",
    machine_id: "",
    start_date: today,
    start_time: "09:00",
    end_date: today,
    end_time: "10:00",
    reason: "",
  }
}

export function MaintenanceManager() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cancelled">("active")
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<MaintenanceForm>(initialForm)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<MaintenanceWindow | null>(null)
  const [editReason, setEditReason] = useState("")
  const [updating, setUpdating] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<MaintenanceWindow | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [windowResult, machineResult] = await Promise.all([
      maintenanceService.getWindows(),
      machineService.getMachines(),
    ])
    if (windowResult.error || machineResult.error) {
      setLoadError(windowResult.error?.message ?? machineResult.error?.message ?? "Administrative records could not be loaded.")
      if (windowResult.error) setWindows([])
      if (machineResult.error) setMachines([])
    }
    if (!windowResult.error) setWindows(windowResult.data)
    if (!machineResult.error) setMachines(machineResult.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const machineNames = useMemo(() => new Map(machines.map((machine) => [machine.id, machine.name])), [machines])
  const visibleWindows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return windows.filter((window) => {
      if (statusFilter !== "all" && window.status !== statusFilter) return false
      const scopeName = window.scope === "global" ? "entire lab global" : machineNames.get(window.machine_id ?? "") ?? window.machine_id ?? "machine"
      return !normalized || `${scopeName} ${window.reason}`.toLowerCase().includes(normalized)
    })
  }, [windows, statusFilter, query, machineNames])

  const openCreate = () => {
    setForm(initialForm())
    setActionError(null)
    setCreateOpen(true)
  }

  const createWindow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const reason = form.reason.trim()
    if (!reason) {
      setActionError("A maintenance reason is required.")
      return
    }
    if (form.scope === "machine" && !form.machine_id) {
      setActionError("Select the affected machine.")
      return
    }
    if (`${form.end_date}T${form.end_time}` <= `${form.start_date}T${form.start_time}`) {
      setActionError("Maintenance must end after it starts.")
      return
    }

    setSaving(true)
    setActionError(null)
    const result = await maintenanceService.createWindow({
      scope: form.scope,
      ...(form.scope === "machine" ? { machine_id: form.machine_id } : {}),
      start_date: form.start_date,
      start_time: form.start_time,
      end_date: form.end_date,
      end_time: form.end_time,
      reason,
    })
    setSaving(false)
    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      return
    }
    setWindows((current) => [result.data, ...current])
    toast.success("Maintenance window scheduled")
    setCreateOpen(false)
  }

  const updateWindow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editTarget || updating) return
    const reason = editReason.trim()
    if (!reason) {
      setActionError("A maintenance reason is required.")
      return
    }
    setUpdating(true)
    setActionError(null)
    const result = await maintenanceService.updateWindow(editTarget.id, { reason })
    setUpdating(false)
    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      return
    }
    setWindows((current) => current.map((window) => window.id === result.data.id ? result.data : window))
    toast.success("Maintenance reason updated")
    setEditTarget(null)
  }

  const cancelWindow = async () => {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    const result = await maintenanceService.cancelWindow(cancelTarget.id)
    setCancelling(false)
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    setWindows((current) => current.map((window) => window.id === result.data.id ? result.data : window))
    toast.success("Maintenance window cancelled")
    setCancelTarget(null)
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Maintenance windows</CardTitle>
            <CardDescription className="mt-2">Block machine or lab-wide time before bookings are accepted.</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void loadData()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh</Button>
            <Button type="button" onClick={openCreate}><Plus aria-hidden="true" />Schedule maintenance</Button>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_11rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search machine or reason" aria-label="Search maintenance windows" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-full" aria-label="Filter maintenance status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="all">All statuses</SelectItem></SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Loading maintenance windows..." /> : loadError ? (
          <StatePanel kind="error" title="Unable to load maintenance" description={loadError} actionLabel="Try again" onAction={() => void loadData()} />
        ) : windows.length === 0 ? (
          <StatePanel title="No maintenance windows" description="Scheduled downtime will appear here and block conflicting bookings." actionLabel="Schedule maintenance" onAction={openCreate} />
        ) : visibleWindows.length === 0 ? (
          <StatePanel title="No matching maintenance windows" description="Change the search or status filter to see other records." />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border">
            {visibleWindows.map((window) => (
              <div key={window.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary"><CalendarClock className="size-5" aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{window.scope === "global" ? "Entire lab" : machineNames.get(window.machine_id ?? "") ?? "Unknown machine"}</p>
                    <Badge variant={window.status === "active" ? "default" : "secondary"}>{window.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{formatPortalDateTime(window.start_at)} – {formatPortalDateTime(window.end_at)}</p>
                  <p className="mt-1 text-sm">{window.reason}</p>
                </div>
                {window.status === "active" ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditTarget(window); setEditReason(window.reason); setActionError(null) }}><Edit3 aria-hidden="true" />Edit reason</Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelTarget(window)}><XCircle aria-hidden="true" />Cancel window</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!saving) setCreateOpen(open) }}>
        <DialogContent showCloseButton={!saving} className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Schedule maintenance</DialogTitle><DialogDescription>The server will reject bookings that overlap this window.</DialogDescription></DialogHeader>
          <form id="maintenance-create-form" className="grid gap-4" onSubmit={createWindow}>
            <InlineError message={actionError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="maintenance-scope">Scope</Label>
                <Select value={form.scope} onValueChange={(scope) => setForm((current) => ({ ...current, scope: scope as MaintenanceForm["scope"], machine_id: scope === "global" ? "" : current.machine_id }))}>
                  <SelectTrigger id="maintenance-scope" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="machine">One machine</SelectItem><SelectItem value="global">Entire lab</SelectItem></SelectContent>
                </Select>
              </div>
              {form.scope === "machine" ? (
                <div className="grid gap-2">
                  <Label htmlFor="maintenance-machine">Machine</Label>
                  <Select value={form.machine_id} onValueChange={(machineId) => setForm((current) => ({ ...current, machine_id: machineId }))}>
                    <SelectTrigger id="maintenance-machine" className="w-full"><SelectValue placeholder="Select a machine" /></SelectTrigger>
                    <SelectContent>{machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2"><Label htmlFor="maintenance-start-date">Start date</Label><Input id="maintenance-start-date" type="date" min={labToday()} value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="maintenance-start-time">Start time</Label><Input id="maintenance-start-time" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="maintenance-end-date">End date</Label><Input id="maintenance-end-date" type="date" min={form.start_date} value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} required /></div>
              <div className="grid gap-2"><Label htmlFor="maintenance-end-time">End time</Label><Input id="maintenance-end-time" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} required /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="maintenance-reason">Reason</Label><Textarea id="maintenance-reason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} maxLength={300} placeholder="Calibration, repair, cleaning, or facility closure" required /></div>
          </form>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="maintenance-create-form" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}{saving ? "Scheduling..." : "Schedule window"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open && !updating) setEditTarget(null) }}>
        <DialogContent showCloseButton={!updating}>
          <DialogHeader><DialogTitle>Edit maintenance reason</DialogTitle><DialogDescription>Timing and scope are immutable; cancel and recreate the window if those details must change.</DialogDescription></DialogHeader>
          <form id="maintenance-edit-form" className="grid gap-3" onSubmit={updateWindow}>
            <InlineError message={actionError} />
            <Label htmlFor="maintenance-edit-reason">Reason</Label>
            <Textarea id="maintenance-edit-reason" value={editReason} onChange={(event) => setEditReason(event.target.value)} maxLength={300} required />
          </form>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={updating}>Cancel</Button><Button type="submit" form="maintenance-edit-form" disabled={updating}>{updating ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}{updating ? "Saving..." : "Save reason"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(cancelTarget)}
        title="Cancel this maintenance window?"
        description="The window remains in the audit history, but its time will become available for future booking requests."
        confirmLabel="Cancel window"
        destructive
        pending={cancelling}
        onConfirm={cancelWindow}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
      />
    </Card>
  )
}
