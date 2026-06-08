import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import StateMessage from '@/components/StateMessage'
import { userService } from '@/services/userService'
import { ROLES } from '@/lib/constants'

const UsersManager = () => {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        setError(null)
        const { data, error: loadError } = await userService.getUsers()
        if (loadError) {
            setError(loadError)
            setUsers([])
        } else {
            setUsers(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchUsers() // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchUsers])

    const changeStatus = async (user, status) => {
        setBusyId(user.id)
        const { error: updateError } = await userService.updateStatus(user.id, status)
        setBusyId(null)
        if (updateError) {
            toast.error(updateError.message || 'Unable to update user status')
            return
        }
        toast.success(status === 'suspended' ? 'User suspended' : 'User reactivated')
        fetchUsers()
    }

    const changeRole = async (user, role) => {
        setBusyId(user.id)
        const { error: updateError } = await userService.updateRole(user.id, role)
        setBusyId(null)
        if (updateError) {
            toast.error(updateError.message || 'Unable to update user role')
            return
        }
        toast.success('User role updated')
        fetchUsers()
    }

    if (loading) return <div className="h-40 animate-pulse rounded-md bg-muted" />
    if (error) return <StateMessage type="error" title="Unable to load users" description={error.message} actionLabel="Try again" onAction={fetchUsers} />

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">Users</h3>
                    <p className="text-sm text-muted-foreground">Suspend access and change roles without direct database edits.</p>
                </div>
                <Button variant="outline" onClick={fetchUsers}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                </Button>
            </div>

            {users.length === 0 ? (
                <StateMessage title="No users found" description="User profiles will appear after signup." />
            ) : (
                <div className="overflow-hidden rounded-md border bg-card">
                    {users.map((user) => (
                        <div key={user.id} className="grid gap-3 border-b p-4 last:border-b-0 lg:grid-cols-[1.3fr_auto_auto] lg:items-center">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium">{user.full_name || 'Unnamed user'}</p>
                                    <Badge variant={user.status === 'active' ? 'success' : user.status === 'pending_approval' ? 'warning' : 'destructive'}>{user.status}</Badge>
                                    <Badge variant="outline">{user.role}</Badge>
                                </div>
                                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                                <p className="text-xs text-muted-foreground">UID: {user.id}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {ROLES.map((role) => (
                                    <Button key={role} size="sm" variant={user.role === role ? 'default' : 'outline'} disabled={busyId === user.id || user.role === role} onClick={() => changeRole(user, role)}>
                                        {role}
                                    </Button>
                                ))}
                            </div>
                            <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                                {user.status === 'suspended' ? (
                                    <Button size="sm" onClick={() => changeStatus(user, 'active')} disabled={busyId === user.id}>Reactivate</Button>
                                ) : (
                                    <Button size="sm" variant="destructive" onClick={() => changeStatus(user, 'suspended')} disabled={busyId === user.id}>Suspend</Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default UsersManager
