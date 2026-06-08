import React, { useCallback, useEffect, useState } from 'react'
import { addDays, format } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import StateMessage from '@/components/StateMessage'
import { bookingService } from '@/services/bookingService'
import { BOOKING_STATUS_LABELS } from '@/lib/constants'

const statusVariant = {
    pending: 'warning',
    approved: 'success',
    rejected: 'destructive',
    cancelled: 'secondary',
}

const OperationsSchedule = () => {
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [filters, setFilters] = useState({
        date_from: format(new Date(), 'yyyy-MM-dd'),
        date_to: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        status: '',
    })

    const fetchBookings = useCallback(async () => {
        setLoading(true)
        setError(null)
        const { data, error: loadError } = await bookingService.getBookings(filters)
        if (loadError) {
            setError(loadError)
            setBookings([])
        } else {
            setBookings(data || [])
        }
        setLoading(false)
    }, [filters])

    useEffect(() => {
        fetchBookings() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchBookings])

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border bg-card p-4 lg:flex-row lg:items-end">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                        <label htmlFor="schedule-from" className="text-sm font-medium">From</label>
                        <Input id="schedule-from" type="date" value={filters.date_from} onChange={(e) => setFilters((current) => ({ ...current, date_from: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="schedule-to" className="text-sm font-medium">To</label>
                        <Input id="schedule-to" type="date" value={filters.date_to} onChange={(e) => setFilters((current) => ({ ...current, date_to: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="schedule-status" className="text-sm font-medium">Status</label>
                        <select
                            id="schedule-status"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={filters.status}
                            onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
                        >
                            <option value="">All statuses</option>
                            {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <Button variant="outline" onClick={fetchBookings} disabled={loading}>
                    <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                    Refresh
                </Button>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />)}
                </div>
            ) : error ? (
                <StateMessage type="error" title="Unable to load schedule" description={error.message} actionLabel="Try again" onAction={fetchBookings} />
            ) : bookings.length === 0 ? (
                <StateMessage title="No bookings in this range" description="Approved, pending, rejected, and cancelled bookings will appear here." />
            ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                    {bookings.map((booking) => (
                        <div key={booking.id} className="grid gap-3 border-b p-4 last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                            <div>
                                <p className="font-medium">{booking.machines?.name || 'Unknown machine'}</p>
                                <p className="text-sm text-muted-foreground">{booking.machines?.location || 'Location not set'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium">{booking.booking_date}</p>
                                <p className="text-sm text-muted-foreground">{booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium">{booking.profiles?.full_name || 'Student'}</p>
                                <p className="truncate text-sm text-muted-foreground">{booking.purpose || 'No purpose provided'}</p>
                            </div>
                            <Badge variant={statusVariant[booking.status] || 'secondary'}>{BOOKING_STATUS_LABELS[booking.status] || booking.status}</Badge>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default OperationsSchedule
