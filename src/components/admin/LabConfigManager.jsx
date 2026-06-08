import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import StateMessage from '@/components/StateMessage'
import { labConfigService } from '@/services/labConfigService'
import { WEEKDAYS } from '@/lib/constants'

const LabConfigManager = () => {
    const [config, setConfig] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const fetchConfig = useCallback(async () => {
        setLoading(true)
        setError(null)
        const { data, error: loadError } = await labConfigService.getConfig()
        if (loadError) {
            setError(loadError)
        } else {
            setConfig(data)
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchConfig() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchConfig])

    const toggleWeekday = (day) => {
        setConfig((current) => {
            const active = new Set(current.active_weekdays || [])
            if (active.has(day)) active.delete(day)
            else active.add(day)
            return { ...current, active_weekdays: [...active].sort() }
        })
    }

    const saveConfig = async () => {
        setSaving(true)
        const { data, error: saveError } = await labConfigService.updateConfig(config)
        setSaving(false)
        if (saveError) {
            toast.error(saveError.message || 'Unable to save lab configuration')
        } else {
            setConfig(data)
            toast.success('Lab configuration saved')
        }
    }

    if (loading) return <div className="h-40 animate-pulse rounded-md bg-muted" />
    if (error) return <StateMessage type="error" title="Unable to load lab configuration" description={error.message} actionLabel="Try again" onAction={fetchConfig} />
    if (!config) return null

    return (
        <Card>
            <CardHeader>
                <CardTitle>Lab Configuration</CardTitle>
                <CardDescription>Set the default operating hours and booking limits enforced by the server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                        <label htmlFor="open-time" className="text-sm font-medium">Open time</label>
                        <Input id="open-time" type="time" value={config.open_time?.slice(0, 5) || '09:00'} onChange={(e) => setConfig({ ...config, open_time: `${e.target.value}:00` })} />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="close-time" className="text-sm font-medium">Close time</label>
                        <Input id="close-time" type="time" value={config.close_time?.slice(0, 5) || '18:00'} onChange={(e) => setConfig({ ...config, close_time: `${e.target.value}:00` })} />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="advance-days" className="text-sm font-medium">Advance days</label>
                        <Input id="advance-days" type="number" min="1" max="90" value={config.max_advance_days} onChange={(e) => setConfig({ ...config, max_advance_days: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="duration-hours" className="text-sm font-medium">Max hours</label>
                        <Input id="duration-hours" type="number" min="1" max="12" value={config.max_duration_hours} onChange={(e) => setConfig({ ...config, max_duration_hours: Number(e.target.value) })} />
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium">Active weekdays</p>
                    <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => (
                            <Button
                                key={day.value}
                                type="button"
                                variant={config.active_weekdays?.includes(day.value) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => toggleWeekday(day.value)}
                            >
                                {day.label.slice(0, 3)}
                            </Button>
                        ))}
                    </div>
                </div>

                <Button onClick={saveConfig} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
            </CardContent>
        </Card>
    )
}

export default LabConfigManager
