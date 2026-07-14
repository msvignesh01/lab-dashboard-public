"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Edit3, LoaderCircle, Plus, RefreshCw, Search, Trash2, Wrench, X } from "lucide-react"
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
import { DEPARTMENTS } from "@/lib/constants"
import { isSafeImageUrl } from "@/lib/security"
import type { Machine } from "@/lib/types"
import { machineService } from "@/services/portal-service"
import { ConfirmActionDialog, InlineError, LoadingState, StatePanel } from "@/components/portal/admin/common"

type MachineForm = {
  name: string
  description: string
  department: string
  location: string
  image_url: string
  is_active: boolean
  requires_training: boolean
}

type SpecificationRow = { key: string; value: string }

const emptyForm: MachineForm = {
  name: "",
  description: "",
  department: "",
  location: "",
  image_url: "",
  is_active: true,
  requires_training: false,
}

function rowsFromMachine(machine: Machine | null): SpecificationRow[] {
  if (!machine) return [{ key: "", value: "" }]
  const entries = Object.entries(machine.specifications ?? {})
  return entries.length ? entries.map(([key, value]) => ({ key, value: String(value ?? "") })) : [{ key: "", value: "" }]
}

export function MachineManager() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)
  const [form, setForm] = useState<MachineForm>(emptyForm)
  const [specificationRows, setSpecificationRows] = useState<SpecificationRow[]>([{ key: "", value: "" }])
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadMachines = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const result = await machineService.getMachines()
    if (result.error) {
      setMachines([])
      setLoadError(result.error.message)
    } else {
      setMachines(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMachines() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadMachines])

  const visibleMachines = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return machines
    return machines.filter((machine) => (
      `${machine.name} ${machine.department ?? ""} ${machine.location ?? ""}`.toLowerCase().includes(normalized)
    ))
  }, [machines, query])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSpecificationRows([{ key: "", value: "" }])
    setActionError(null)
    setFormOpen(true)
  }

  const openEdit = (machine: Machine) => {
    setEditing(machine)
    setForm({
      name: machine.name,
      description: machine.description ?? "",
      department: machine.department ?? "",
      location: machine.location ?? "",
      image_url: machine.image_url ?? "",
      is_active: machine.is_active,
      requires_training: machine.requires_training,
    })
    setSpecificationRows(rowsFromMachine(machine))
    setActionError(null)
    setFormOpen(true)
  }

  const buildSpecifications = (): Record<string, string> => {
    const specifications: Record<string, string> = {}
    for (const row of specificationRows) {
      const key = row.key.trim()
      const value = row.value.trim()
      if (key && value) specifications[key] = value
    }
    return specifications
  }

  const saveMachine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return

    const name = form.name.trim()
    if (!name) {
      setActionError("Machine name is required.")
      return
    }
    const imageUrl = form.image_url.trim()
    if (!isSafeImageUrl(imageUrl)) {
      setActionError("Enter a valid HTTPS machine image URL.")
      return
    }

    setSaving(true)
    setActionError(null)
    const payload = {
      name,
      description: form.description.trim(),
      department: form.department.trim(),
      location: form.location.trim(),
      image_url: imageUrl,
      is_active: form.is_active,
      requires_training: form.requires_training,
      specifications: buildSpecifications(),
    }
    const result = editing
      ? await machineService.updateMachine(editing.id, payload)
      : await machineService.createMachine(payload)
    setSaving(false)

    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      return
    }

    setMachines((current) => editing
      ? current.map((machine) => machine.id === result.data.id ? result.data : machine)
      : [result.data, ...current])
    toast.success(editing ? "Machine updated" : "Machine added")
    setFormOpen(false)
  }

  const deleteMachine = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const result = await machineService.deleteMachine(deleteTarget.id)
    setDeleting(false)

    if (result.error) {
      toast.error(result.error.message)
      return
    }

    if (result.data.deleted === false && result.data.machine) {
      const retainedMachine = result.data.machine
      setMachines((current) => current.map((machine) => machine.id === retainedMachine.id ? retainedMachine : machine))
      toast.success(result.data.message ?? "Machine deactivated because booking history must be retained")
    } else {
      setMachines((current) => current.filter((machine) => machine.id !== deleteTarget.id))
      toast.success("Machine deleted")
    }
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Machine registry</CardTitle>
            <CardDescription className="mt-2">Create equipment records and control whether each machine can accept bookings.</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void loadMachines()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh
            </Button>
            <Button type="button" onClick={openCreate}><Plus aria-hidden="true" />Add machine</Button>
          </div>
        </div>
        <div className="relative mt-2 max-w-xl">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search by machine, department, or location" aria-label="Search machine registry" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Loading machine registry..." /> : loadError ? (
          <StatePanel kind="error" title="Unable to load machines" description={loadError} actionLabel="Try again" onAction={() => void loadMachines()} />
        ) : machines.length === 0 ? (
          <StatePanel title="No machines registered" description="Add the first machine when the lab equipment record is ready." actionLabel="Add machine" onAction={openCreate} />
        ) : visibleMachines.length === 0 ? (
          <StatePanel title="No matching machines" description="Change the search text to see other registry records." />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border">
            {visibleMachines.map((machine) => (
              <div key={machine.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary"><Wrench className="size-5" aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{machine.name}</p>
                    <Badge variant={machine.is_active ? "default" : "destructive"}>{machine.is_active ? "Active" : "Inactive"}</Badge>
                    {machine.requires_training ? <Badge variant="secondary">Training required</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{machine.department || "No department"} / {machine.location || "No location"}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{machine.description || "No description provided"}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(machine)}><Edit3 aria-hidden="true" />Edit</Button>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(machine)}><Trash2 aria-hidden="true" />Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open) }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "Add machine"}</DialogTitle>
            <DialogDescription>Machine availability and training policy are enforced by the server for every booking.</DialogDescription>
          </DialogHeader>
          <form id="machine-form" className="grid gap-4" onSubmit={saveMachine}>
            <InlineError message={actionError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="machine-name">Machine name</Label>
                <Input id="machine-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={200} required autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="machine-department">Department</Label>
                <Select value={form.department || "none"} onValueChange={(value) => setForm((current) => ({ ...current, department: value === "none" ? "" : value }))}>
                  <SelectTrigger id="machine-department" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No department</SelectItem>
                    {DEPARTMENTS.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="machine-location">Location</Label>
                <Input id="machine-location" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} maxLength={200} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="machine-image">Image URL</Label>
                <Input id="machine-image" type="url" value={form.image_url} onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value }))} placeholder="https://..." maxLength={500} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="machine-description">Description</Label>
                <Textarea id="machine-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={1000} />
              </div>
            </div>

            <fieldset className="grid gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-medium">Specifications</legend>
                <Button type="button" variant="outline" size="sm" disabled={specificationRows.length >= 25} onClick={() => setSpecificationRows((current) => [...current, { key: "", value: "" }])}><Plus aria-hidden="true" />Add field</Button>
              </div>
              {specificationRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input aria-label={`Specification ${index + 1} label`} placeholder="Build volume" maxLength={50} value={row.key} onChange={(event) => setSpecificationRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} />
                  <Input aria-label={`Specification ${index + 1} value`} placeholder="250 × 250 × 250 mm" maxLength={200} value={row.value} onChange={(event) => setSpecificationRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove specification ${index + 1}`} onClick={() => setSpecificationRows((current) => current.length === 1 ? [{ key: "", value: "" }] : current.filter((_, itemIndex) => itemIndex !== index))}><X aria-hidden="true" /></Button>
                </div>
              ))}
            </fieldset>

            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} className="size-4 rounded border-input" />
                Active for booking
              </label>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" checked={form.requires_training} onChange={(event) => setForm((current) => ({ ...current, requires_training: event.target.checked }))} className="size-4 rounded border-input" />
                Requires approved training
              </label>
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="machine-form" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {saving ? "Saving..." : editing ? "Save changes" : "Add machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        title="Delete this machine?"
        description={`Deleting ${deleteTarget?.name ?? "this machine"} cannot be undone. If booking history exists, the server will preserve the record and deactivate it instead.`}
        confirmLabel="Delete machine"
        destructive
        pending={deleting}
        onConfirm={deleteMachine}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      />
    </Card>
  )
}
