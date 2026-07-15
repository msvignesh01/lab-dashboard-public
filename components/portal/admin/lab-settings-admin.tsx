"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Clock3, LoaderCircle, RotateCcw, Save, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AdminPageHeader,
  ConfirmActionDialog,
  formatPortalDateTime,
  InlineError,
  LoadingState,
  RoleBoundary,
  StatePanel,
} from "@/components/portal/admin/common"
import { WEEKDAYS } from "@/lib/constants"
import type { LabConfig } from "@/lib/types"
import { labConfigService } from "@/services/portal-service"

type SettingsDraft = {
  openTime: string
  closeTime: string
  activeWeekdays: number[]
  maxAdvanceDays: string
  maxDurationHours: string
}

type ValidSettings = {
  open_time: string
  close_time: string
  active_weekdays: number[]
  max_advance_days: number
  max_duration_hours: number
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function draftFromConfig(config: LabConfig): SettingsDraft {
  return {
    openTime: config.open_time,
    closeTime: config.close_time,
    activeWeekdays: [...config.active_weekdays].sort((first, second) => first - second),
    maxAdvanceDays: String(config.max_advance_days),
    maxDurationHours: String(config.max_duration_hours),
  }
}

function normalizedWeekdays(days: number[]): string {
  return [...days].sort((first, second) => first - second).join(",")
}

function validateDraft(draft: SettingsDraft): { value: ValidSettings | null; error: string | null } {
  if (!timePattern.test(draft.openTime) || !timePattern.test(draft.closeTime)) {
    return { value: null, error: "Enter valid opening and closing times." }
  }
  if (draft.openTime >= draft.closeTime) {
    return { value: null, error: "Closing time must be later than opening time." }
  }
  if (draft.activeWeekdays.length === 0) {
    return { value: null, error: "Select at least one active weekday." }
  }

  const maxAdvanceDays = Number(draft.maxAdvanceDays)
  if (!Number.isInteger(maxAdvanceDays) || maxAdvanceDays < 1 || maxAdvanceDays > 90) {
    return { value: null, error: "Maximum advance booking must be a whole number from 1 to 90 days." }
  }

  const maxDurationHours = Number(draft.maxDurationHours)
  if (!Number.isInteger(maxDurationHours) || maxDurationHours < 1 || maxDurationHours > 8) {
    return { value: null, error: "Maximum booking duration must be a whole number from 1 to 8 hours." }
  }

  return {
    value: {
      open_time: draft.openTime,
      close_time: draft.closeTime,
      active_weekdays: [...draft.activeWeekdays].sort((first, second) => first - second),
      max_advance_days: maxAdvanceDays,
      max_duration_hours: maxDurationHours,
    },
    error: null,
  }
}

function SettingsWorkspace() {
  const [config, setConfig] = useState<LabConfig | null>(null)
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const result = await labConfigService.getConfig()
    if (result.error) {
      setConfig(null)
      setDraft(null)
      setLoadError(result.error.message)
    } else {
      setConfig(result.data)
      setDraft(draftFromConfig(result.data))
      setActionError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadConfig() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadConfig])

  const dirty = useMemo(() => {
    if (!config || !draft) return false
    return draft.openTime !== config.open_time
      || draft.closeTime !== config.close_time
      || normalizedWeekdays(draft.activeWeekdays) !== normalizedWeekdays(config.active_weekdays)
      || Number(draft.maxAdvanceDays) !== config.max_advance_days
      || Number(draft.maxDurationHours) !== config.max_duration_hours
  }, [config, draft])

  const updateDraft = (update: (current: SettingsDraft) => SettingsDraft) => {
    setDraft((current) => current ? update(current) : current)
    setActionError(null)
  }

  const toggleWeekday = (day: number) => {
    updateDraft((current) => ({
      ...current,
      activeWeekdays: current.activeWeekdays.includes(day)
        ? current.activeWeekdays.filter((weekday) => weekday !== day)
        : [...current.activeWeekdays, day].sort((first, second) => first - second),
    }))
  }

  const resetDraft = () => {
    if (!config) return
    setDraft(draftFromConfig(config))
    setActionError(null)
  }

  const requestSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft || saving) return
    const validation = validateDraft(draft)
    if (validation.error) {
      setActionError(validation.error)
      return
    }
    if (!dirty) return
    setActionError(null)
    setConfirmOpen(true)
  }

  const saveConfig = async () => {
    if (!draft || saving) return
    const validation = validateDraft(draft)
    if (!validation.value) {
      setConfirmOpen(false)
      setActionError(validation.error)
      return
    }

    setSaving(true)
    setActionError(null)
    const result = await labConfigService.updateConfig(validation.value)
    setSaving(false)
    setConfirmOpen(false)

    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      return
    }

    setConfig(result.data)
    setDraft(draftFromConfig(result.data))
    toast.success("Lab configuration updated")
  }

  const activeDayLabels = draft
    ? WEEKDAYS.filter((weekday) => draft.activeWeekdays.includes(weekday.value)).map((weekday) => weekday.label).join(", ")
    : ""

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Administration"
        title="Lab settings"
        description="Configure the operating schedule and booking limits enforced by the server for every reservation."
      />

      {loading ? (
        <LoadingState label="Loading lab configuration..." />
      ) : loadError ? (
        <StatePanel
          kind="error"
          title="Unable to load lab settings"
          description={loadError}
          actionLabel="Try again"
          onAction={() => void loadConfig()}
        />
      ) : config && draft ? (
        <form className="space-y-6" onSubmit={requestSave}>
          <InlineError message={actionError} />

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Clock3 className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Operating schedule</CardTitle>
                  <CardDescription className="mt-2">Bookings can only be created within these hours on active weekdays.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="lab-open-time">Opening time</Label>
                  <Input
                    id="lab-open-time"
                    type="time"
                    value={draft.openTime}
                    onChange={(event) => updateDraft((current) => ({ ...current, openTime: event.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lab-close-time">Closing time</Label>
                  <Input
                    id="lab-close-time"
                    type="time"
                    value={draft.closeTime}
                    onChange={(event) => updateDraft((current) => ({ ...current, closeTime: event.target.value }))}
                    required
                  />
                </div>
              </div>

              <fieldset className="grid gap-3">
                <legend className="text-sm font-medium">Active weekdays</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {WEEKDAYS.map((weekday) => {
                    const selected = draft.activeWeekdays.includes(weekday.value)
                    return (
                      <Button
                        key={weekday.value}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        onClick={() => toggleWeekday(weekday.value)}
                      >
                        {weekday.label.slice(0, 3)}
                      </Button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="grid gap-2">
                <Label htmlFor="lab-timezone">Timezone</Label>
                <Input id="lab-timezone" value={config.timezone} readOnly aria-readonly="true" />
                <p className="text-xs text-muted-foreground">Timezone is managed by the deployment and cannot be changed here.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Settings2 className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Booking limits</CardTitle>
                  <CardDescription className="mt-2">Set the furthest booking horizon and the longest permitted reservation.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lab-max-advance">Maximum advance booking</Label>
                <div className="relative">
                  <Input
                    id="lab-max-advance"
                    type="number"
                    min={1}
                    max={90}
                    step={1}
                    value={draft.maxAdvanceDays}
                    onChange={(event) => updateDraft((current) => ({ ...current, maxAdvanceDays: event.target.value }))}
                    className="pr-16"
                    required
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lab-max-duration">Maximum booking duration</Label>
                <div className="relative">
                  <Input
                    id="lab-max-duration"
                    type="number"
                    min={1}
                    max={8}
                    step={1}
                    value={draft.maxDurationHours}
                    onChange={(event) => updateDraft((current) => ({ ...current, maxDurationHours: event.target.value }))}
                    className="pr-16"
                    required
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">hours</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              <p>{dirty ? "You have unsaved configuration changes." : "Configuration matches the saved server state."}</p>
              {config.updated_at ? <p className="mt-1 text-xs">Last updated {formatPortalDateTime(config.updated_at)}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={resetDraft} disabled={!dirty || saving}>
                <RotateCcw aria-hidden="true" />Reset
              </Button>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                {saving ? "Saving..." : "Save settings"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <StatePanel kind="error" title="Lab settings unavailable" description="The configuration response was empty." actionLabel="Try again" onAction={() => void loadConfig()} />
      )}

      <ConfirmActionDialog
        open={confirmOpen}
        title="Apply these lab settings?"
        description={draft
          ? `The lab will operate ${draft.openTime}-${draft.closeTime} on ${activeDayLabels || "no selected days"}. Bookings will be limited to ${draft.maxAdvanceDays} days in advance and ${draft.maxDurationHours} hours in duration. This takes effect immediately.`
          : "This configuration change will take effect immediately."}
        confirmLabel="Apply settings"
        pending={saving}
        onConfirm={saveConfig}
        onOpenChange={setConfirmOpen}
      />
    </div>
  )
}

export function LabSettingsAdmin() {
  return (
    <RoleBoundary roles={["admin"]}>
      <SettingsWorkspace />
    </RoleBoundary>
  )
}
