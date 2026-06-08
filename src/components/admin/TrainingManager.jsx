import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import StateMessage from '@/components/StateMessage'
import { trainingService } from '@/services/trainingService'
import { machineService } from '@/services/machineService'
import { TRAINING_STATUS_LABELS } from '@/lib/constants'

const TrainingManager = () => {
    const [records, setRecords] = useState([])
    const [machines, setMachines] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ student_id: '', machine_id: '', status: 'active', notes: '' })

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const [recordResult, machineResult] = await Promise.all([
            trainingService.getRecords(),
            machineService.getMachines({ isAdmin: true }),
        ])
        if (recordResult.error) {
            setError(recordResult.error)
            setRecords([])
        } else {
            setRecords(recordResult.data || [])
        }
        if (!machineResult.error) setMachines(machineResult.data || [])
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchData() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchData])

    const submit = async (e) => {
        e.preventDefault()
        if (!form.student_id || !form.machine_id) {
            toast.error('Student UID and machine are required')
            return
        }
        setSaving(true)
        const { error: saveError } = await trainingService.saveRecord(form)
        setSaving(false)
        if (saveError) {
            toast.error(saveError.message || 'Unable to save training record')
            return
        }
        toast.success(form.status === 'active' ? 'Training approved' : 'Training revoked')
        setForm({ student_id: '', machine_id: '', status: 'active', notes: '' })
        fetchData()
    }

    return (
        <div className="space-y-6">
            <form onSubmit={submit} className="rounded-md border bg-card p-4 space-y-4">
                <div>
                    <h3 className="font-semibold">Training Eligibility</h3>
                    <p className="text-sm text-muted-foreground">Approvals are enforced before students can book training-required machines.</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-4">
                    <Input value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} placeholder="Student UID" aria-label="Student UID" required />
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.machine_id} onChange={(e) => setForm({ ...form, machine_id: e.target.value })} required aria-label="Machine">
                        <option value="">Select machine</option>
                        {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                    </select>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Training status">
                        <option value="active">Approve</option>
                        <option value="revoked">Revoke</option>
                    </select>
                    <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Training'}</Button>
                </div>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes visible to operators" aria-label="Training notes" />
            </form>

            {loading ? (
                <div className="h-32 animate-pulse rounded-md bg-muted" />
            ) : error ? (
                <StateMessage type="error" title="Unable to load training records" description={error.message} actionLabel="Try again" onAction={fetchData} />
            ) : records.length === 0 ? (
                <StateMessage title="No training records" description="Training approvals and revocations will appear here." />
            ) : (
                <div className="space-y-3">
                    {records.map((record) => (
                        <div key={record.id} className="grid gap-2 rounded-md border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
                            <div>
                                <p className="font-medium">{record.student_id}</p>
                                <p className="text-sm text-muted-foreground">Student UID</p>
                            </div>
                            <div>
                                <p className="font-medium">{machines.find((machine) => machine.id === record.machine_id)?.name || record.machine_id}</p>
                                <p className="text-sm text-muted-foreground">{record.notes || 'No notes'}</p>
                            </div>
                            <Badge variant={record.status === 'active' ? 'success' : 'destructive'}>{TRAINING_STATUS_LABELS[record.status] || record.status}</Badge>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default TrainingManager
