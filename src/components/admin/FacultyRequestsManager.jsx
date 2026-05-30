import React, { useCallback, useEffect, useState } from 'react'
import { Check, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { profileService } from '@/services/profileService'

const FacultyRequestsManager = () => {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [approvingId, setApprovingId] = useState(null)

    const fetchRequests = useCallback(async () => {
        setLoading(true)
        setError(null)
        const { data, error: loadError } = await profileService.getPendingFacultyRequests()
        if (loadError) {
            setError(loadError)
            setRequests([])
        } else {
            setRequests(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchRequests() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchRequests])

    const handleApprove = async (request) => {
        setApprovingId(request.id)
        const { error: approveError } = await profileService.approveFacultyRequest(request.id)
        setApprovingId(null)

        if (approveError) {
            toast.error(approveError.message || 'Failed to approve faculty request')
            return
        }

        toast.success(`${request.full_name || request.email} approved as faculty`)
        setRequests((current) => current.filter((item) => item.id !== request.id))
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            Faculty Access Requests
                        </CardTitle>
                        <CardDescription>Approve verified faculty accounts before they can review bookings or manage lab equipment.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={fetchRequests} disabled={loading}>
                        <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                        Refresh
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading faculty requests...
                    </div>
                ) : error ? (
                    <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                        <p className="text-sm font-medium text-destructive">Unable to load faculty requests</p>
                        <p className="text-sm text-muted-foreground">{error.message}</p>
                        <Button variant="outline" className="w-fit" onClick={fetchRequests}>Try again</Button>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-md border p-8 text-center">
                        <UserCheck className="h-10 w-10 text-muted-foreground/40" />
                        <p className="font-medium">No pending faculty requests</p>
                        <p className="max-w-sm text-sm text-muted-foreground">New verified faculty signups will appear here for admin approval.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {requests.map((request) => (
                            <div key={request.id} className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium">{request.full_name || 'Unnamed faculty'}</p>
                                        <Badge variant="warning">Pending</Badge>
                                    </div>
                                    <p className="truncate text-sm text-muted-foreground">{request.email}</p>
                                    <p className="text-sm text-muted-foreground">{request.department || 'Department not specified'}</p>
                                </div>
                                <Button onClick={() => handleApprove(request)} disabled={approvingId === request.id}>
                                    <Check className="mr-2 h-4 w-4" />
                                    {approvingId === request.id ? 'Approving...' : 'Approve'}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default FacultyRequestsManager
