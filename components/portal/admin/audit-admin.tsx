"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Eye, FileClock, Filter, LoaderCircle, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AdminPageHeader,
  formatPortalDateTime,
  humanize,
  InlineError,
  LoadingState,
  RoleBoundary,
  StatePanel,
} from "@/components/portal/admin/common"
import type { AuditLogEntry } from "@/lib/types"
import { auditService } from "@/services/portal-service"

type AuditFilters = {
  entityType: string
  action: string
}

const emptyFilters: AuditFilters = { entityType: "", action: "" }

const entityTypes = [
  { value: "booking", label: "Booking" },
  { value: "machine", label: "Machine" },
  { value: "maintenance_window", label: "Maintenance window" },
  { value: "training_record", label: "Training record" },
  { value: "profile", label: "User profile" },
  { value: "lab_config", label: "Lab configuration" },
] as const

function AuditWorkspace() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(emptyFilters)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)
  const requestSequence = useRef(0)

  const loadEntries = useCallback(async (filters: AuditFilters, cursor: string | null = null) => {
    const append = Boolean(cursor)
    const requestId = ++requestSequence.current
    if (append) {
      setLoadingMore(true)
      setLoadMoreError(null)
    } else {
      setLoading(true)
      setLoadError(null)
      setLoadMoreError(null)
      setNextCursor(null)
      setSelectedEntry(null)
    }
    const result = await auditService.getAuditLog({
      entity_type: filters.entityType || undefined,
      action: filters.action.trim() || undefined,
      cursor: cursor || undefined,
      limit: 50,
    })

    if (requestId !== requestSequence.current) return
    if (result.error) {
      if (append) {
        setLoadMoreError(result.error.message)
      } else {
        setEntries([])
        setLoadError(result.error.message)
      }
    } else {
      if (append) {
        setEntries((current) => {
          const seen = new Set(current.map((entry) => entry.id))
          const additions = result.data.items.filter((entry) => {
            if (seen.has(entry.id)) return false
            seen.add(entry.id)
            return true
          })
          return [...current, ...additions]
        })
      } else {
        setEntries(result.data.items)
      }
      setNextCursor(result.data.nextCursor)
    }
    if (append) setLoadingMore(false)
    else setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadEntries(appliedFilters) }, 0)
    return () => window.clearTimeout(timer)
  }, [appliedFilters, loadEntries])

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextFilters = {
      entityType: draftFilters.entityType,
      action: draftFilters.action.trim(),
    }
    if (
      nextFilters.entityType === appliedFilters.entityType
      && nextFilters.action === appliedFilters.action
    ) {
      void loadEntries(appliedFilters)
      return
    }
    setNextCursor(null)
    setLoadMoreError(null)
    setLoading(true)
    setAppliedFilters(nextFilters)
  }

  const clearFilters = () => {
    setDraftFilters(emptyFilters)
    if (!appliedFilters.entityType && !appliedFilters.action) {
      void loadEntries(emptyFilters)
      return
    }
    setNextCursor(null)
    setLoadMoreError(null)
    setLoading(true)
    setAppliedFilters(emptyFilters)
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="Inspect immutable administrative and booking events recorded by the service. Filters are applied on the server."
        actions={(
          <Button type="button" variant="outline" onClick={() => void loadEntries(appliedFilters)} disabled={loading || loadingMore}>
            <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Refresh
          </Button>
        )}
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Event filters</CardTitle>
          <CardDescription>Use an exact action name when narrowing the log by action.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] lg:items-end" onSubmit={applyFilters}>
            <div className="grid gap-2">
              <Label htmlFor="audit-entity-filter">Entity type</Label>
              <Select
                value={draftFilters.entityType || "all"}
                onValueChange={(value) => setDraftFilters((current) => ({
                  ...current,
                  entityType: value === "all" ? "" : value,
                }))}
              >
                <SelectTrigger id="audit-entity-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entity types</SelectItem>
                  {entityTypes.map((entity) => (
                    <SelectItem key={entity.value} value={entity.value}>{entity.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audit-action-filter">Action</Label>
              <Input
                id="audit-action-filter"
                value={draftFilters.action}
                onChange={(event) => setDraftFilters((current) => ({ ...current, action: event.target.value }))}
                placeholder="For example: booking.approved"
                maxLength={100}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading || loadingMore}>
                {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Filter aria-hidden="true" />}
                {loading ? "Applying..." : "Apply filters"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                disabled={loading || loadingMore || (!draftFilters.entityType && !draftFilters.action && !appliedFilters.entityType && !appliedFilters.action)}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Recorded events</CardTitle>
          <CardDescription>Open an event to inspect its actor, target, and server-recorded metadata. Load additional pages to continue through the matching history.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading audit events..." />
          ) : loadError ? (
            <StatePanel
              kind="error"
              title="Unable to load the audit trail"
              description={loadError}
              actionLabel="Try again"
              onAction={() => void loadEntries(appliedFilters)}
            />
          ) : entries.length === 0 ? (
            <StatePanel
              title="No audit events found"
              description={appliedFilters.entityType || appliedFilters.action
                ? "No events match the applied filters. Clear or change the filters to broaden the search."
                : "The service did not return any audit events for this workspace."}
            />
          ) : (
            <div className="space-y-4">
              <div className="divide-y overflow-hidden rounded-xl border">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <FileClock className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{humanize(entry.action)}</p>
                        <Badge variant="outline">{humanize(entry.entity_type)}</Badge>
                        {entry.actor_role ? <Badge variant="secondary">{humanize(entry.actor_role)}</Badge> : null}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={entry.entity_id}>
                        Entity ID: {entry.entity_id}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatPortalDateTime(entry.created_at)}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedEntry(entry)}>
                      <Eye aria-hidden="true" />View details
                    </Button>
                  </div>
                ))}
              </div>
              <InlineError message={loadMoreError} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {entries.length} {entries.length === 1 ? "event" : "events"}.
                  {nextCursor ? " More matching events are available." : " All matching events are loaded."}
                </p>
                {nextCursor ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadEntries(appliedFilters, nextCursor)}
                    disabled={loadingMore || loading}
                  >
                    {loadingMore ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                    {loadingMore ? "Loading..." : "Load more events"}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedEntry)} onOpenChange={(open) => { if (!open) setSelectedEntry(null) }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedEntry ? humanize(selectedEntry.action) : "Audit event"}</DialogTitle>
            <DialogDescription>Read-only event data recorded by the server.</DialogDescription>
          </DialogHeader>
          {selectedEntry ? (
            <div className="grid gap-5 text-sm">
              <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{selectedEntry.id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recorded</dt>
                  <dd className="mt-1">{formatPortalDateTime(selectedEntry.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entity</dt>
                  <dd className="mt-1">{humanize(selectedEntry.entity_type)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entity ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{selectedEntry.entity_id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actor role</dt>
                  <dd className="mt-1">{selectedEntry.actor_role ? humanize(selectedEntry.actor_role) : "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actor UID</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{selectedEntry.actor_uid ?? "Not recorded"}</dd>
                </div>
              </dl>
              <div className="grid gap-2">
                <Label>Metadata</Label>
                <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
                  {JSON.stringify(selectedEntry.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AuditAdmin() {
  return (
    <RoleBoundary roles={["faculty", "admin"]}>
      <AuditWorkspace />
    </RoleBoundary>
  )
}
