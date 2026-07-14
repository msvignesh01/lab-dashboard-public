"use client"

import { useState, type ReactNode } from "react"
import { AlertCircle, Clock, MailCheck, RefreshCw, ShieldOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"

function GateShell({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-md bg-secondary">{icon}</div>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">{description}</p>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

export function LoadingGate({ message = "Verifying your account…" }: { message?: string }) {
  return <GateShell icon={<RefreshCw className="size-5 animate-spin" />} title="Please wait" description={message} />
}

export function VerifyEmailGate() {
  const { user, resendVerificationEmail, reloadUser, signOut } = useAuth()
  const [busy, setBusy] = useState<"check" | "send" | null>(null)

  return (
    <GateShell icon={<MailCheck />} title="Verify your email" description={`Open the verification link sent to ${user?.email ?? "your institutional email"}, then check again.`}>
      <Button onClick={async () => { setBusy("check"); const next = await reloadUser(); setBusy(null); if (!next?.emailVerified) toast.message("Verification is not complete yet.") }} disabled={busy !== null}>
        <RefreshCw className={busy === "check" ? "animate-spin" : ""} />Check verification
      </Button>
      <Button variant="outline" onClick={async () => { setBusy("send"); const { error } = await resendVerificationEmail(); setBusy(null); if (error) toast.error(error.message); else toast.success("Verification email sent.") }} disabled={busy !== null}>Resend email</Button>
      <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
    </GateShell>
  )
}

export function PendingApprovalGate() {
  const { refreshProfile, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <GateShell icon={<Clock />} title="Faculty approval pending" description="An administrator must approve this verified faculty request before operational access is enabled.">
      <Button onClick={async () => { setBusy(true); await refreshProfile(); setBusy(false) }} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} />Refresh status</Button>
      <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
    </GateShell>
  )
}

export function SuspendedGate() {
  const { signOut } = useAuth()
  return <GateShell icon={<ShieldOff />} title="Account unavailable" description="This account is not active. Contact the lab administrator if you believe this is a mistake."><Button variant="outline" onClick={() => void signOut()}>Sign out</Button></GateShell>
}

export function ProfileErrorGate({ message }: { message?: string }) {
  const { refreshProfile, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <GateShell icon={<AlertCircle />} title="Account needs attention" description={message ?? "The server-authoritative account profile could not be loaded."}>
      <Button onClick={async () => { setBusy(true); await refreshProfile(); setBusy(false) }} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} />Retry</Button>
      <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
    </GateShell>
  )
}
