import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import StateMessage from '@/components/StateMessage'
import { maintenanceService } from '@/services/maintenanceService'
import { machineService } from '@/services/machineService'

const today = new Date().toISOString().slice(0, 10)

const MaintenanceManager = () => {
    const [windows, setWindows] = useState([])
    const [machines, setMachines] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({
        scope: 'machine',
        machine_id: '',
        start_date: today,
        start_time: '09:00',
        end_date: today,
        end_time: '10:00',
        reason: '',
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const [windowResult, machineResult] = await Promise.all([
            maintenanceService.getWindows(),
            machineService.getMachines({ isAdmin: true }),
        ])
        if (windowResult.error) {
            setError(windowResult.error)
            setWindows([])
        } else {
            setWindows(windowResult.data || [])
        }
        if (!machineResult.error) setMachines(machineResult.data || [])
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchData() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchData])

    const submit = async (e) => {
        e.preventDefault()
        if (!form.reason.trim()) {
            toast.error('Maintenance reason is required')
            return
        }
        setSaving(true)
        const { error: saveError } = await maintenanceService.createWindow(form)
        setSaving(false)
        if (saveError) {
            toast.error(saveError.message || 'Unable to schedule maintenance')
            return
        }
        toast.success('Maintenance scheduled')
        setForm((current) => ({ ...current, reason: '' }))
        fetchData()
    }

    const cancelWindow = async (id) => {
        const { error: cancelError } = await maintenanceService.cancelWindow(id)
        if (cancelError) {
            toast.error(cancelError.message || 'Unable to cancel maintenance')
            return
        }
        toast.success('Maintenance cancelled')
        fetchData()
    }

    return (
        <div className="space-y-6">
            <form onSubmit={submit} className="rounded-md border bg-card p-4 space-y-4">
                <div>
                    <h3 className="font-semibold">Schedule Maintenance</h3>
                    <p className="text-sm text-muted-foreground">Blocked windows are enforced by the booking API and shown in availability.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                        <label htmlFor="maintenance-scope" className="text-sm font-medium">Scope</label>
                        <select id="maintenance-scope" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                            <option value="machine">Machine</option>
                            <option value="global">Entire lab</option>
                        </select>
                    </div>
                    {form.scope === 'machine' && (
                        <div className="space-y-1 md:col-span-2">
                            <label htmlFor="maintenance-machine" className="text-sm font-medium">Machine</label>
                            <select id="maintenance-machine" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.machine_id} onChange={(e) => setForm({ ...form, machine_id: e.target.value })} required>
                                <option value="">Select machine</option>
                                {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} aria-label="Maintenance start date" required />
                    <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} aria-label="Maintenance start time" required />
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} aria-label="Maintenance end date" required />
                    <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} aria-label="Maintenance end time" required />
                </div>
                <div className="space-y-1">
                    <label htmlFor="maintenance-reason" className="text-sm font-medium">Reason</label>
                    <Input id="maintenance-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Calibration, repair, cleaning, unavailable staff" required />
                </div>
                <Button type="submit" disabled={saving}>{saving ? 'Scheduling...' : 'Schedule Maintenance'}</Button>
            </form>

            {loading ? (
                <div className="h-32 animate-pulse rounded-md bg-muted" />
            ) : error ? (
                <StateMessage type="error" title="Unable to load maintenance" description={error.message} actionLabel="Try again" onAction={fetchData} />
            ) : windows.length === 0 ? (
                <StateMessage title="No maintenance windows" description="Scheduled maintenance and blocked lab times will appear here." />
            ) : (
                <div className="space-y-3">
                    {windows.map((item) => (
                        <div key={item.id} className="flex flex-col gap-3 rounded-md border bg-card p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">{item.scope === 'global' ? 'Entire lab' : machines.find((machine) => machine.id === item.machine_id)?.name || 'Machine'}</p>
                                    <Badge variant={item.status === 'active' ? 'warning' : 'secondary'}>{item.status}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{new Date(item.start_at).toLocaleString()} - {new Date(item.end_at).toLocaleString()}</p>
                                <p className="text-sm">{item.reason}</p>
                            </div>
                            {item.status === 'active' && (
                                <Button variant="outline" onClick={() => cancelWindow(item.id)}>Cancel</Button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default MaintenanceManager
