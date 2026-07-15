"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, LoaderCircle, RefreshCw, Search, UserCheck, UserRoundCog, UserX } from "lucide-react"
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
import {
  AdminPageHeader,
  ConfirmActionDialog,
  InlineError,
  LoadingState,
  RoleBoundary,
  StatePanel,
  formatPortalDateTime,
  humanize,
} from "@/components/portal/admin/common"
import { useAuth } from "@/hooks/use-auth"
import { EMAIL_DOMAINS } from "@/lib/constants"
import type { ManagedProfile, Profile, Role } from "@/lib/types"
import { facultyRequestService, userService } from "@/services/portal-service"

type UserChange =
  | { kind: "role"; user: ManagedProfile; value: Role }
  | { kind: "status"; user: ManagedProfile; value: "active" | "suspended" }

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: "student", label: "Student" },
  { value: "faculty", label: "Faculty" },
  { value: "admin", label: "Administrator" },
]

function roleMatchesInstitutionalEmail(email: string, role: Role): boolean {
  const normalized = email.trim().toLowerCase()
  if (normalized.endsWith(EMAIL_DOMAINS.STUDENT)) return role === "student"
  if (normalized.endsWith(EMAIL_DOMAINS.FACULTY)) return role === "faculty" || role === "admin"
  return false
}

function upsertProfile(current: ManagedProfile[], profile: Profile | ManagedProfile): ManagedProfile[] {
  const index = current.findIndex((user) => user.id === profile.id)
  if (index === -1) return [{ ...profile }, ...current]
  return current.map((user) => user.id === profile.id ? { ...user, ...profile } : user)
}

function UsersWorkspace() {
  const { profile: actingProfile } = useAuth()
  const [users, setUsers] = useState<ManagedProfile[]>([])
  const [pendingFaculty, setPendingFaculty] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false)
  const [userLoadError, setUserLoadError] = useState<string | null>(null)
  const [facultyLoadError, setFacultyLoadError] = useState<string | null>(null)
  const [userPageError, setUserPageError] = useState<string | null>(null)
  const [nextUsersCursor, setNextUsersCursor] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [approveTarget, setApproveTarget] = useState<Profile | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Profile | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [facultyActionPending, setFacultyActionPending] = useState(false)
  const [userChange, setUserChange] = useState<UserChange | null>(null)
  const [userChangePending, setUserChangePending] = useState(false)
  const directoryRequestSequence = useRef(0)

  const loadData = useCallback(async () => {
    const requestId = ++directoryRequestSequence.current
    setLoading(true)
    setLoadingMoreUsers(false)
    setUserLoadError(null)
    setFacultyLoadError(null)
    setUserPageError(null)
    setNextUsersCursor(null)
    const [userResult, facultyResult] = await Promise.all([
      userService.getUsers({ limit: 50 }),
      facultyRequestService.getPending(),
    ])
    if (requestId !== directoryRequestSequence.current) return
    setUsers(userResult.data?.items ?? [])
    setNextUsersCursor(userResult.data?.nextCursor ?? null)
    setPendingFaculty(facultyResult.data ?? [])
    setUserLoadError(userResult.error?.message ?? null)
    setFacultyLoadError(facultyResult.error?.message ?? null)
    setLoading(false)
  }, [])

  const loadMoreDirectoryUsers = useCallback(async () => {
    if (!nextUsersCursor || loadingMoreUsers || loading) return
    const cursor = nextUsersCursor
    const requestId = ++directoryRequestSequence.current
    setLoadingMoreUsers(true)
    setUserPageError(null)
    const result = await userService.getUsers({ cursor, limit: 50 })
    if (requestId !== directoryRequestSequence.current) return

    if (result.error) {
      setUserPageError(result.error.message)
    } else {
      setUsers((current) => {
        const loadedIds = new Set(current.map((user) => user.id))
        const additions = result.data.items.filter((user) => {
          if (loadedIds.has(user.id)) return false
          loadedIds.add(user.id)
          return true
        })
        return [...current, ...additions]
      })
      setNextUsersCursor(result.data.nextCursor)
    }
    setLoadingMoreUsers(false)
  }, [loading, loadingMoreUsers, nextUsersCursor])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false
      if (statusFilter !== "all" && user.status !== statusFilter) return false
      if (!normalized) return true
      return `${user.full_name} ${user.email} ${user.department} ${user.register_number ?? ""}`
        .toLowerCase()
        .includes(normalized)
    }).sort((a, b) => a.email.localeCompare(b.email))
  }, [query, roleFilter, statusFilter, users])

  const approveFaculty = async () => {
    if (!approveTarget || facultyActionPending) return
    setFacultyActionPending(true)
    setActionError(null)
    const result = await facultyRequestService.approve(approveTarget.id)
    setFacultyActionPending(false)
    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      setApproveTarget(null)
      return
    }
    setPendingFaculty((current) => current.filter((profile) => profile.id !== result.data.id))
    setUsers((current) => upsertProfile(current, result.data))
    toast.success("Faculty account approved")
    setApproveTarget(null)
  }

  const rejectFaculty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!rejectTarget || facultyActionPending) return
    const reason = rejectReason.trim()
    if (!reason) {
      setActionError("A rejection reason is required.")
      return
    }
    setFacultyActionPending(true)
    setActionError(null)
    const result = await facultyRequestService.reject(rejectTarget.id, reason)
    setFacultyActionPending(false)
    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      return
    }
    setPendingFaculty((current) => current.filter((profile) => profile.id !== result.data.id))
    setUsers((current) => upsertProfile(current, result.data))
    toast.success("Faculty request rejected")
    setRejectTarget(null)
    setRejectReason("")
  }

  const stageUserChange = (user: ManagedProfile, kind: UserChange["kind"], value: string) => {
    if (user.id === actingProfile?.id) {
      toast.error("You cannot change your own role or access status.")
      return
    }
    if (kind === "role") {
      if (value === user.role) return
      setUserChange({ kind, user, value: value as Role })
    } else {
      const reconciliation = (user.auth_sync_status === "failed"
        || (user.auth_sync_status === "pending" && user.auth_sync_recoverable === true))
        && user.auth_sync_target === value
      if (value === user.status && !reconciliation) return
      setUserChange({ kind, user, value: value as "active" | "suspended" })
    }
    setActionError(null)
  }

  const saveUserChange = async () => {
    if (!userChange || userChangePending) return
    setUserChangePending(true)
    setActionError(null)
    const result = userChange.kind === "role"
      ? await userService.updateRole(userChange.user.id, userChange.value)
      : await userService.updateStatus(userChange.user.id, userChange.value)
    setUserChangePending(false)
    if (result.error) {
      setActionError(result.error.message)
      toast.error(result.error.message)
      setUserChange(null)
      return
    }
    setUsers((current) => current.map((user) => user.id === result.data.id ? result.data : user))
    toast.success(userChange.kind === "role" ? "User role updated" : "User access status updated")
    setUserChange(null)
  }

  const changeDescription = userChange
    ? userChange.kind === "role"
      ? `${userChange.user.full_name} will change from ${humanize(userChange.user.role)} to ${humanize(userChange.value)}. Their next authorized request will use the new role.`
      : ((userChange.user.auth_sync_status === "failed"
          || (userChange.user.auth_sync_status === "pending" && userChange.user.auth_sync_recoverable === true))
        && userChange.user.auth_sync_target === userChange.value)
        ? `${userChange.user.full_name}'s interrupted authentication synchronization will be retried for the ${humanize(userChange.value)} state.`
        : `${userChange.user.full_name} will be marked ${humanize(userChange.value)}. ${userChange.value === "suspended" ? "They will lose portal access." : "Their portal access may resume if all other account checks pass."}`
    : "Confirm this account change."

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Administration / People"
        title="People and access"
        description="Review faculty requests and manage active account roles and access states. The server prevents unauthorized and self-directed privilege changes."
        actions={(
          <Button type="button" variant="outline" onClick={() => void loadData()} disabled={loading || loadingMoreUsers}>
            <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh
          </Button>
        )}
      />

      <InlineError message={actionError} />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Pending faculty requests</CardTitle>
          <CardDescription>Approve only after independently verifying the applicant&apos;s institutional role.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <LoadingState label="Loading faculty requests..." /> : facultyLoadError ? (
            <StatePanel kind="error" title="Unable to load faculty requests" description={facultyLoadError} actionLabel="Try again" onAction={() => void loadData()} />
          ) : pendingFaculty.length === 0 ? (
            <StatePanel title="No pending faculty requests" description="New requests that require an administrator decision will appear here." />
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border">
              {pendingFaculty.map((faculty) => (
                <div key={faculty.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary"><UserCheck className="size-5" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{faculty.full_name}</p><Badge variant="secondary">Pending approval</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{faculty.email} / {faculty.department || "No department"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Requested {formatPortalDateTime(faculty.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => { setActionError(null); setApproveTarget(faculty) }} disabled={facultyActionPending}><CheckCircle2 aria-hidden="true" />Approve</Button>
                    <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setActionError(null); setRejectReason(""); setRejectTarget(faculty) }} disabled={facultyActionPending}><UserX aria-hidden="true" />Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><CardTitle>User directory</CardTitle><CardDescription className="mt-2">Change roles and account status only when an institutional authorization supports it. Role choices are constrained by the verified email domain; search and filters apply to the pages loaded below.</CardDescription></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search people or email" aria-label="Search users" />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-36" aria-label="Filter by role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="student">Students</SelectItem><SelectItem value="faculty">Faculty</SelectItem><SelectItem value="admin">Admins</SelectItem></SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="pending_approval">Pending</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <LoadingState label="Loading user directory..." /> : userLoadError ? (
            <StatePanel kind="error" title="Unable to load the user directory" description={userLoadError} actionLabel="Try again" onAction={() => void loadData()} />
          ) : users.length === 0 ? (
            <StatePanel title="No user records" description="The user service returned no profiles." />
          ) : visibleUsers.length === 0 ? (
            <StatePanel
              title="No matching users in the loaded pages"
              description={nextUsersCursor
                ? "Change the search or filters, or load more directory pages to continue searching."
                : "Change the search or filters to see other accounts."}
            />
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border">
              {visibleUsers.map((user) => {
                const isSelf = user.id === actingProfile?.id
                const statusSyncLocked = user.auth_sync_status === "pending" || user.auth_sync_status === "failed"
                return (
                  <div key={user.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem] lg:items-center">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary"><UserRoundCog className="size-5" aria-hidden="true" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{user.full_name}</p>
                          {isSelf ? <Badge variant="outline">You</Badge> : null}
                          {user.bootstrap_admin ? <Badge variant="outline">Bootstrap admin</Badge> : null}
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{user.email} / {user.department || "No department"}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                           {user.auth_email_verified != null ? <span>Email {user.auth_email_verified ? "verified" : "unverified"}</span> : null}
                           {user.auth_disabled != null ? <span>Auth {user.auth_disabled ? "disabled" : "enabled"}</span> : null}
                           {user.auth_sync_status === "failed" ? <Badge variant="destructive">Auth sync failed</Badge> : null}
                           {user.auth_sync_status === "pending" ? <Badge variant="secondary">Auth sync in progress</Badge> : null}
                         </div>
                         {user.auth_sync_status === "failed" && user.auth_sync_target && !isSelf ? <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => stageUserChange(user, "status", user.auth_sync_target!)}>Retry authentication sync</Button> : null}
                         {user.auth_sync_status === "pending" && user.auth_sync_recoverable && user.auth_sync_target && !isSelf ? <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => stageUserChange(user, "status", user.auth_sync_target!)}>Recover stale authentication sync</Button> : null}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs" htmlFor={`role-${user.id}`}>Role</Label>
                      <Select value={user.role} onValueChange={(value) => stageUserChange(user, "role", value)} disabled={isSelf || user.status === "pending_approval" || user.auth_sync_status === "pending"}>
                        <SelectTrigger id={`role-${user.id}`} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value} disabled={!roleMatchesInstitutionalEmail(user.email, option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs" htmlFor={`status-${user.id}`}>Access status</Label>
                      <Select value={user.status} onValueChange={(value) => stageUserChange(user, "status", value)} disabled={isSelf || user.status === "pending_approval" || statusSyncLocked}>
                        <SelectTrigger id={`status-${user.id}`} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem>{user.status === "pending_approval" ? <SelectItem value="pending_approval">Pending approval</SelectItem> : null}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!loading && !userLoadError && users.length > 0 ? (
            <div className="mt-4 space-y-3">
              <InlineError message={userPageError} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {nextUsersCursor
                    ? `${users.length} users loaded. More directory records are available; search and filters are not yet complete.`
                    : `${users.length} users loaded. The full directory is available to search and filter.`}
                </p>
                {nextUsersCursor ? (
                  <Button type="button" variant="outline" onClick={() => void loadMoreDirectoryUsers()} disabled={loadingMoreUsers}>
                    {loadingMoreUsers ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                    {loadingMoreUsers ? "Loading..." : "Load more users"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={Boolean(approveTarget)}
        title="Approve this faculty account?"
        description={`${approveTarget?.full_name ?? "This applicant"} will receive faculty permissions after the server records this approval.`}
        confirmLabel="Approve faculty"
        pending={facultyActionPending}
        onConfirm={approveFaculty}
        onOpenChange={(open) => { if (!open) setApproveTarget(null) }}
      />

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => { if (!open && !facultyActionPending) { setRejectTarget(null); setRejectReason(""); setActionError(null) } }}>
        <DialogContent showCloseButton={!facultyActionPending}>
          <DialogHeader>
            <DialogTitle>Reject faculty request?</DialogTitle>
            <DialogDescription>Provide a concise institutional reason. The decision and reason are retained by the server.</DialogDescription>
          </DialogHeader>
          <form id="faculty-reject-form" className="grid gap-3" onSubmit={rejectFaculty}>
            <InlineError message={actionError} />
            <Label htmlFor="faculty-reject-reason">Rejection reason</Label>
            <Textarea id="faculty-reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={500} required autoFocus />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)} disabled={facultyActionPending}>Cancel</Button>
            <Button type="submit" form="faculty-reject-form" variant="destructive" disabled={facultyActionPending}>
              {facultyActionPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <UserX aria-hidden="true" />}
              {facultyActionPending ? "Rejecting..." : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(userChange)}
        title={userChange?.kind === "role" ? "Change this user's role?" : "Change this user's access status?"}
        description={changeDescription}
        confirmLabel="Apply account change"
        destructive={userChange?.kind === "status" && userChange.value === "suspended"}
        pending={userChangePending}
        onConfirm={saveUserChange}
        onOpenChange={(open) => { if (!open) setUserChange(null) }}
      />
    </div>
  )
}

export function UsersAdmin() {
  return <RoleBoundary roles={["admin"]}><UsersWorkspace /></RoleBoundary>
}
