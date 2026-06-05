import React, { useEffect, useState, useCallback } from 'react'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import StateMessage from '@/components/StateMessage'
import { notificationService } from '@/services/notificationService'

const NotificationCenter = () => {
    const [open, setOpen] = useState(false)
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const fetchNotifications = useCallback(async () => {
        setLoading(true)
        setError(null)
        const { data, error: loadError } = await notificationService.getNotifications()
        if (loadError) {
            setError(loadError)
            setNotifications([])
        } else {
            setNotifications(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchNotifications() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchNotifications])

    const unread = notifications.filter((item) => !item.read_at)

    const markAllRead = async () => {
        if (unread.length === 0) return
        const { error: markError } = await notificationService.markRead(unread.map((item) => item.id))
        if (!markError) {
            setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
        }
    }

    return (
        <>
            <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label="Open notifications">
                <Bell className="h-5 w-5" />
                {unread.length > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {unread.length > 9 ? '9+' : unread.length}
                    </span>
                )}
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Notifications</DialogTitle>
                        <DialogDescription>Booking decisions, access updates, maintenance, and training alerts.</DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center justify-between gap-2">
                        <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={loading}>
                            <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                            Refresh
                        </Button>
                        <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread.length === 0}>
                            <CheckCheck className="mr-2 h-4 w-4" />
                            Mark all read
                        </Button>
                    </div>

                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />)}
                        </div>
                    ) : error ? (
                        <StateMessage
                            type="error"
                            title="Unable to load notifications"
                            description={error.message || 'Notifications are temporarily unavailable.'}
                            actionLabel="Try again"
                            onAction={fetchNotifications}
                        />
                    ) : notifications.length === 0 ? (
                        <StateMessage title="No notifications" description="Important booking and lab updates will appear here." />
                    ) : (
                        <div className="max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
                            {notifications.map((item) => (
                                <div key={item.id} className="rounded-md border p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-medium">{item.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                                            <p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                                        </div>
                                        {!item.read_at && <Badge variant="warning">New</Badge>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}

export default NotificationCenter
