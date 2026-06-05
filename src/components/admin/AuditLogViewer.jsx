import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import StateMessage from '@/components/StateMessage'
import { auditService } from '@/services/auditService'

const AuditLogViewer = () => {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        setError(null)
        const { data, error: loadError } = await auditService.getAuditLog()
        if (loadError) {
            setError(loadError)
            setLogs([])
        } else {
            setLogs(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchLogs() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchLogs])

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">Audit Log</h3>
                    <p className="text-sm text-muted-foreground">Operational changes written by trusted server APIs.</p>
                </div>
                <Button variant="outline" onClick={fetchLogs} disabled={loading}>
                    <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                    Refresh
                </Button>
            </div>

            {loading ? (
                <div className="h-40 animate-pulse rounded-md bg-muted" />
            ) : error ? (
                <StateMessage type="error" title="Unable to load audit log" description={error.message} actionLabel="Try again" onAction={fetchLogs} />
            ) : logs.length === 0 ? (
                <StateMessage title="No audit entries" description="Server-side actions will appear here after operators use the system." />
            ) : (
                <div className="space-y-3">
                    {logs.map((log) => (
                        <div key={log.id} className="rounded-md border bg-card p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{log.entity_type}</Badge>
                                <p className="font-medium">{log.action}</p>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{new Date(log.created_at).toLocaleString()} by {log.actor_role || 'system'}</p>
                            <p className="mt-1 break-all text-xs text-muted-foreground">Entity: {log.entity_id}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default AuditLogViewer
