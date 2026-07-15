"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { ClipboardCheck, LoaderCircle, RefreshCw, Search, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  AdminPageHeader,
  ConfirmActionDialog,
  InlineError,
  LoadingState,
  RoleBoundary,
  StatePanel,
  formatPortalDateTime,
} from "@/components/portal/admin/common"
import type { Machine, TrainingRecord } from "@/lib/types"
import { machineService, trainingService } from "@/services/portal-service"

type TrainingStatus = TrainingRecord["status"]

type TrainingPayload = {
  student_id?: string
  student_email?: string
  machine_id: string
  status: TrainingStatus
  notes?: string
}

type PendingChange = {
  payload: TrainingPayload
  title: string
  description: string
}

function normalizeRecords(value: TrainingRecord[] | TrainingRecord | null): TrainingRecord[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function TrainingWorkspace() {
  const [records, setRecords] = useState<TrainingRecord[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [machineFilter, setMachineFilter] = useState("all")
  const [studentIdentifier, setStudentIdentifier] = useState("")
  const [machineId, setMachineId] = useState("")
  const [status, setStatus] = useState<TrainingStatus>("active")
  const [notes, setNotes] = useState("")
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [recordResult, machineResult] = await Promise.all([
      trainingService.getRecords(),
      machineService.getMachines(),
    ])

    if (recordResult.error || machineResult.error) {
      setRecords(recordResult.data ? normalizeRecords(recordResult.data) : [])
      setMachines(machineResult.data ?? [])
      setLoadError(recordResult.error?.message ?? machineResult.error?.message ?? "Training records could not be loaded.")
    } else {
      setRecords(normalizeRecords(recordResult.data))
      setMachines(machineResult.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const machineNames = useMemo(() => new Map(machines.map((machine) => [machine.id, machine.name])), [machines])

  const visibleRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return records.filter((record) => {
      if (machineFilter !== "all" && record.machine_id !== machineFilter) return false
      if (!normalized) return true
      return `${record.student_id} ${machineNames.get(record.machine_id) ?? ""} ${record.notes ?? ""}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [machineFilter, machineNames, query, records])

  const stageFormChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const identifier = studentIdentifier.trim()
    if (!identifier) {
      setActionError("Enter the student's institutional email address or profile ID.")
      return
    }
    if (!machineId) {
      setActionError("Select a machine.")
      return
    }

    const payload: TrainingPayload = {
      machine_id: machineId,
      status,
      notes: notes.trim(),
      ...(identifier.includes("@") ? { student_email: identifier.toLowerCase() } : { student_id: identifier }),
    }
    const machineName = machineNames.get(machineId) ?? "the selected machine"
    setActionError(null)
    setPendingChange({
      payload,
      title: status === "active" ? "Grant machine training?" : "Revoke machine training?",
      description: `${status === "active" ? "Grant" : "Revoke"} ${identifier}'s eligibility for ${machineName}. The server will validate the student and record the acting staff member.`,
    })
  }

  const stageRecordChange = (record: TrainingRecord) => {
    const nextStatus: TrainingStatus = record.status === "active" ? "revoked" : "active"
    setActionError(null)
    setPendingChange({
      payload: {
        student_id: record.student_id,
        machine_id: record.machine_id,
        status: nextStatus,
        notes: record.notes,
      },
      title: nextStatus === "active" ? "Restore training eligibility?" : "Revoke training eligibility?",
      description: `${record.student_id} will be marked ${nextStatus} for ${machineNames.get(record.machine_id) ?? "this machine"}.`,
    })
  }

  const saveChange = async () => {
    if (!pendingChange || saving) return
    setSaving(true)
    setActionError(null)
    const result = await trainingService.saveRecord(pendingChange.payload)
    setSaving(false)

    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      setPendingChange(null)
      return
    }

    setRecords((current) => {
      const existingIndex = current.findIndex((record) => (
        record.id === result.data.id
        || (record.student_id === result.data.student_id && record.machine_id === result.data.machine_id)
      ))
      if (existingIndex === -1) return [result.data, ...current]
      return current.map((record, index) => index === existingIndex ? result.data : record)
    })
    toast.success(result.data.status === "active" ? "Training eligibility granted" : "Training eligibility revoked")
    setPendingChange(null)
    setStudentIdentifier("")
    setNotes("")
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Administration / Training"
        title="Training manager"
        description="Grant or revoke machine-specific training eligibility. Student identity and permissions are verified by the server before every change."
        actions={(
          <Button type="button" variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh
          </Button>
        )}
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Record training decision</CardTitle>
          <CardDescription>Use an exact institutional email address or student profile ID. This action changes booking eligibility.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={stageFormChange}>
            <InlineError message={actionError} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-2 xl:col-span-2">
                <Label htmlFor="training-student">Student email or ID</Label>
                <Input
                  id="training-student"
                  value={studentIdentifier}
                  onChange={(event) => setStudentIdentifier(event.target.value)}
                  placeholder="student@btech.christuniversity.in or profile ID"
                  maxLength={254}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="training-machine">Machine</Label>
                <Select value={machineId} onValueChange={setMachineId} disabled={machines.length === 0}>
                  <SelectTrigger id="training-machine" className="w-full"><SelectValue placeholder="Select a machine" /></SelectTrigger>
                  <SelectContent>{machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="training-status">Decision</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as TrainingStatus)}>
                  <SelectTrigger id="training-status" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Grant access</SelectItem><SelectItem value="revoked">Revoke access</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="training-notes">Decision notes</Label>
              <Textarea id="training-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Assessment, certification, or revocation context" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={loading || saving || machines.length === 0}>
                {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}
                Review decision
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><CardTitle>Training records</CardTitle><CardDescription className="mt-2">The service returns student IDs; names and email addresses are not inferred.</CardDescription></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search student ID, machine, notes" aria-label="Search training records" />
              </div>
              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Filter records by machine"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All machines</SelectItem>{machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <LoadingState label="Loading training records..." /> : loadError ? (
            <StatePanel kind="error" title="Unable to load training records" description={loadError} actionLabel="Try again" onAction={() => void loadData()} />
          ) : records.length === 0 ? (
            <StatePanel title="No training records" description="A record will appear after the first grant or revocation is saved." />
          ) : visibleRecords.length === 0 ? (
            <StatePanel title="No matching records" description="Change the search text or machine filter to see other records." />
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border">
              {visibleRecords.map((record) => (
                <div key={record.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    {record.status === "active" ? <ShieldCheck className="size-5" aria-hidden="true" /> : <ShieldOff className="size-5" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{record.student_id}</p>
                      <Badge variant={record.status === "active" ? "default" : "destructive"}>{record.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{machineNames.get(record.machine_id) ?? `Unknown machine (${record.machine_id})`}</p>
                    <p className="mt-1 text-sm">{record.notes || "No decision notes"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Updated {formatPortalDateTime(record.updated_at ?? record.approved_at ?? record.revoked_at)}</p>
                  </div>
                  <Button type="button" variant={record.status === "active" ? "outline" : "default"} size="sm" onClick={() => stageRecordChange(record)} disabled={saving}>
                    {record.status === "active" ? <ShieldOff aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                    {record.status === "active" ? "Revoke" : "Restore"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={Boolean(pendingChange)}
        title={pendingChange?.title ?? "Confirm training change"}
        description={pendingChange?.description ?? "Confirm this training record change."}
        confirmLabel={pendingChange?.payload.status === "revoked" ? "Revoke eligibility" : "Grant eligibility"}
        destructive={pendingChange?.payload.status === "revoked"}
        pending={saving}
        onConfirm={saveChange}
        onOpenChange={(open) => { if (!open) setPendingChange(null) }}
      />
    </div>
  )
}

export function TrainingAdmin() {
  return <RoleBoundary roles={["faculty", "admin"]}><TrainingWorkspace /></RoleBoundary>
}
