import React, { useState } from 'react'
import { AlertCircle, Clock, MailCheck, RefreshCw, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'

const GateShell = ({ icon, title, description, children }) => (
    <div className="min-h-[100dvh] bg-background p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {React.createElement(icon, { className: 'h-6 w-6' })}
                </div>
                <CardTitle className="text-xl">{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-center">
                <p className="text-sm text-muted-foreground">{description}</p>
                {children}
            </CardContent>
        </Card>
    </div>
)

export const LoadingGate = ({ message = 'Loading...' }) => (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {message}
        </div>
    </div>
)

export const VerifyEmailGate = () => {
    const { user, resendVerificationEmail, reloadUser, signOut } = useAuth()
    const [checking, setChecking] = useState(false)
    const [sending, setSending] = useState(false)

    const handleResend = async () => {
        setSending(true)
        const { error } = await resendVerificationEmail()
        setSending(false)
        if (error) toast.error(error.message || 'Could not send verification email')
        else toast.success('Verification email sent')
    }

    const handleRefresh = async () => {
        setChecking(true)
        const nextUser = await reloadUser()
        setChecking(false)
        if (nextUser?.emailVerified) toast.success('Email verified')
        else toast.message('Verification is not complete yet')
    }

    return (
        <GateShell
            icon={MailCheck}
            title="Verify your email"
            description={`We sent a verification link to ${user?.email || 'your university email'}. Verify it before accessing lab operations.`}
        >
            <div className="flex flex-col gap-2">
                <Button onClick={handleRefresh} disabled={checking}>
                    <RefreshCw className={checking ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                    {checking ? 'Checking...' : 'I verified my email'}
                </Button>
                <Button variant="outline" onClick={handleResend} disabled={sending}>
                    {sending ? 'Sending...' : 'Resend verification email'}
                </Button>
                <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
        </GateShell>
    )
}

export const PendingApprovalGate = () => {
    const { signOut, refreshProfile } = useAuth()
    const [refreshing, setRefreshing] = useState(false)

    const handleRefresh = async () => {
        setRefreshing(true)
        await refreshProfile()
        setRefreshing(false)
        toast.message('Account status refreshed')
    }

    return (
        <GateShell
            icon={Clock}
            title="Faculty approval pending"
            description="Your faculty access request is waiting for an admin to approve it. Lab operations stay locked until approval is complete."
        >
            <div className="flex flex-col gap-2">
                <Button onClick={handleRefresh} disabled={refreshing}>
                    <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                    {refreshing ? 'Refreshing...' : 'Refresh status'}
                </Button>
                <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
        </GateShell>
    )
}

export const SuspendedGate = () => {
    const { signOut } = useAuth()
    return (
        <GateShell
            icon={ShieldOff}
            title="Account unavailable"
            description="This account is not active. Contact the lab administrator if you believe this is a mistake."
        >
            <Button variant="outline" onClick={signOut}>Sign out</Button>
        </GateShell>
    )
}

export const ProfileErrorGate = ({ message = 'We could not load your account profile.' }) => {
    const { refreshProfile, signOut } = useAuth()
    const [refreshing, setRefreshing] = useState(false)

    const handleRetry = async () => {
        setRefreshing(true)
        await refreshProfile()
        setRefreshing(false)
    }

    return (
        <GateShell icon={AlertCircle} title="Account needs attention" description={message}>
            <div className="flex flex-col gap-2">
                <Button onClick={handleRetry} disabled={refreshing}>
                    <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                    {refreshing ? 'Retrying...' : 'Retry'}
                </Button>
                <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
        </GateShell>
    )
}
