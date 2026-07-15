"use client"

import type { ReactNode } from "react"
import {
  Inbox,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/use-auth"
import { LAB_TIMEZONE } from "@/lib/constants"
import type { Role } from "@/lib/types"

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-pretty text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function LoadingState({ label = "Loading records..." }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-xl border bg-card p-8 text-sm text-muted-foreground" role="status">
      <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

export function StatePanel({
  kind = "empty",
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
}: {
  kind?: "empty" | "error" | "notice"
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
}) {
  const Icon = kind === "error" ? TriangleAlert : kind === "notice" ? ShieldAlert : Inbox
  return (
    <div
      className={`flex min-h-40 flex-col items-center justify-center rounded-xl border p-8 text-center ${kind === "error" ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon className={`mb-3 size-8 ${kind === "error" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onAction} disabled={actionDisabled}>
          <RefreshCw className={actionDisabled ? "animate-spin" : ""} aria-hidden="true" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
      {message}
    </div>
  )
}

export function RoleBoundary({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { accessState, profile, loading, profileLoading } = useAuth()

  if (loading || profileLoading || accessState === "initializing") {
    return <LoadingState label="Verifying administrative access..." />
  }

  if (accessState !== "active" || !profile) {
    return (
      <StatePanel
        kind="notice"
        title="Administrative session unavailable"
        description="Sign in with an active, verified institutional account before opening this workspace."
      />
    )
  }

  if (!roles.includes(profile.role)) {
    return (
      <StatePanel
        kind="notice"
        title="You do not have access to this workspace"
        description="The server enforces this permission. Contact a lab administrator if your assigned role is incorrect."
      />
    )
  }

  return children
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  pending = false,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void | Promise<void>
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!pending) onOpenChange(nextOpen) }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void onConfirm()}
            disabled={pending}
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {pending ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: LAB_TIMEZONE,
})

export function formatPortalDateTime(value?: string | null): string {
  if (!value) return "Not recorded"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : dateTimeFormatter.format(date)
}

export function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}
