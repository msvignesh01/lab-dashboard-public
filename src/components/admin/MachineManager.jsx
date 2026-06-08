import React, { useState, useEffect, useCallback } from 'react';
import { machineService } from '@/services/machineService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Trash, Microscope, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { securityUtils } from '@/lib/security';
import { DEPARTMENTS } from '@/lib/constants';
import StateMessage from '@/components/StateMessage';
import ConfirmDialog from '@/components/ConfirmDialog';

const MachineManager = () => {
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        department: '',
        location: '',
        image_url: '',
        is_active: true,
        requires_training: false,
    });
    const [specRows, setSpecRows] = useState([{ key: '', value: '' }]);

    const fetchMachines = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        const { data, error } = await machineService.getMachines({ isAdmin: true });
        if (error) {
            setLoadError(error);
            setMachines([]);
        } else {
            setMachines(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchMachines(); // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchMachines]);

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            department: '',
            location: '',
            image_url: '',
            is_active: true,
            requires_training: false,
        });
        setSpecRows([{ key: '', value: '' }]);
        setEditingMachine(null);
    };

    const handleOpenModal = (machine = null) => {
        if (machine) {
            setEditingMachine(machine);
            setFormData({
                name: machine.name,
                description: machine.description || '',
                department: machine.department || '',
                location: machine.location || '',
                image_url: machine.image_url || '',
                is_active: machine.is_active,
                requires_training: Boolean(machine.requires_training),
            });
            const entries = Object.entries(machine.specifications || {});
            setSpecRows(entries.length > 0 ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: '', value: '' }]);
        } else {
            resetForm();
        }
        setIsModalOpen(true);
    };

    const buildSpecifications = () => {
        const specifications = {};
        for (const row of specRows) {
            const key = row.key.trim();
            const value = String(row.value).trim();
            if (key && value) specifications[key] = value;
        }
        return specifications;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Prevent double submission
        if (submitting) return;

        setSubmitting(true);

        const promise = (async () => {
            const specifications = buildSpecifications();

            const payload = {
                name: formData.name,
                description: formData.description,
                department: formData.department,
                location: formData.location,
                image_url: formData.image_url,
                is_active: formData.is_active,
                requires_training: formData.requires_training,
                specifications,
            };

            let result;
            if (editingMachine) {
                // Optimistic update for editing
                const optimisticMachine = { ...editingMachine, ...payload };
                setMachines(prev => prev.map(m => m.id === editingMachine.id ? optimisticMachine : m));

                result = await machineService.updateMachine(editingMachine.id, payload);
            } else {
                result = await machineService.createMachine(payload);
            }

            if (result.error) throw new Error(result.error.message);

            if (!editingMachine && result.data) {
                // Add new machine to list optimistically if not already there (though we are re-fetching)
                setMachines(prev => [result.data, ...prev]);
            }

            return editingMachine ? 'Machine updated successfully' : 'Machine created successfully';
        })();

        toast.promise(promise, {
            loading: editingMachine ? 'Updating machine...' : 'Creating machine...',
            success: (msg) => {
                setIsModalOpen(false);
                resetForm();
                // Refresh in background to ensure consistency
                setTimeout(() => fetchMachines(), 1000);
                return msg;
            },
            error: () => {
                // Revert optimistic update on error if needed (fetching does this)
                if (editingMachine) fetchMachines();
                return 'Failed to save machine. Please try again.';
            }
        });

        promise.catch((err) => {
            securityUtils.secureLog('error', 'Error saving machine', err?.message);
        }).finally(() => {
            setSubmitting(false);
        });
    };

    const handleDelete = async () => {
        const machine = deleteTarget;
        if (!machine) return;

        // Optimistic update - remove from UI immediately
        const originalMachines = [...machines];
        setMachines(prev => prev.filter(m => m.id !== machine.id));
        setDeleteLoading(true);

        const promise = machineService.deleteMachine(machine.id).then(({ error, data }) => {
            if (error) throw error;
            if (data?.deleted === false && data.machine) {
                setMachines(originalMachines.map(m => m.id === machine.id ? data.machine : m));
                return data.message || 'Machine deactivated because it has booking history';
            }
            return 'Machine deleted successfully';
        });

        toast.promise(promise, {
            loading: 'Deleting machine...',
            success: (msg) => msg,
            error: (err) => {
                // Revert optimistic update on error
                setMachines(originalMachines);
                securityUtils.secureLog('error', 'Error deleting machine', err?.message);
                return err?.message || 'Failed to delete machine. Please try again.';
            }
        });

        promise.finally(() => {
            setDeleteLoading(false);
            setDeleteTarget(null);
        });
    };

    return (
        <div className="space-y-6">
            <div className="sticky top-16 z-10 -mx-1 flex items-center justify-between gap-3 rounded-md bg-background/95 p-1 backdrop-blur md:static md:bg-transparent md:p-0">
                <h2 className="text-2xl font-bold tracking-tight">Machine Management</h2>
                <Button onClick={() => handleOpenModal()} className="shrink-0">
                    <Plus className="mr-2 h-4 w-4" /> Add Machine
                </Button>
            </div>

            <div className="grid gap-4">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
                    </div>
                ) : loadError ? (
                    <StateMessage
                        type="error"
                        title="Unable to load machines"
                        description={loadError.message || 'Machine management is temporarily unavailable.'}
                        actionLabel="Try again"
                        onAction={fetchMachines}
                    />
                ) : machines.length === 0 ? (
                    <StateMessage
                        title="No machines found"
                        description="Add the first lab machine to make it available for booking."
                        actionLabel="Add Machine"
                        onAction={() => handleOpenModal()}
                    />
                ) : (
                    machines.map(machine => (
                        <div key={machine.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg bg-card gap-4">
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <div className="h-16 w-16 rounded-md bg-muted overflow-hidden shrink-0">
                                    {securityUtils.isSafeImageUrl(machine.image_url) ? (
                                        <img src={machine.image_url} alt={machine.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                            <Microscope className="h-8 w-8 opacity-20" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-semibold">{machine.name}</h3>
                                    <p className="text-sm text-muted-foreground">{machine.location}</p>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        <Badge variant={machine.is_active ? 'success' : 'destructive'}>
                                            {machine.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                        <Badge variant="outline">{machine.department || 'General'}</Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenModal(machine)} aria-label={`Edit ${machine.name}`}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(machine)} aria-label={`Delete ${machine.name}`}>
                                    <Trash className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingMachine ? 'Edit Machine' : 'Add New Machine'}</DialogTitle>
                        <DialogDescription>{editingMachine ? 'Update machine details below.' : 'Fill in the details to add a new machine to the lab.'}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="machine-name" className="text-sm font-medium">Name *</label>
                            <Input
                                id="machine-name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="machine-department" className="text-sm font-medium">Department</label>
                                <select
                                    id="machine-department"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={formData.department}
                                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                                >
                                    <option value="">Select Department</option>
                                    {DEPARTMENTS.map(dept => (
                                        <option key={dept} value={dept}>{dept}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="machine-location" className="text-sm font-medium">Location</label>
                                <Input
                                    id="machine-location"
                                    value={formData.location}
                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="machine-image-url" className="text-sm font-medium">Image URL</label>
                            <Input
                                id="machine-image-url"
                                type="url"
                                placeholder="https://example.com/image.jpg"
                                value={formData.image_url}
                                onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">Enter a URL to an image of the machine</p>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="machine-description" className="text-sm font-medium">Description</label>
                            <textarea
                                id="machine-description"
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <label className="text-sm font-medium">Specifications</label>
                                <Button type="button" variant="outline" size="sm" onClick={() => setSpecRows((rows) => [...rows, { key: '', value: '' }])}>
                                    <Plus className="mr-2 h-4 w-4" /> Add detail
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {specRows.map((row, index) => (
                                    <div key={`${index}-${row.key}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                        <Input
                                            aria-label={`Specification ${index + 1} name`}
                                            placeholder="Build volume"
                                            value={row.key}
                                            onChange={(e) => setSpecRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, key: e.target.value } : item))}
                                        />
                                        <Input
                                            aria-label={`Specification ${index + 1} value`}
                                            placeholder="250 x 250 x 250 mm"
                                            value={row.value}
                                            onChange={(e) => setSpecRows((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item))}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Remove specification ${index + 1}`}
                                            onClick={() => setSpecRows((rows) => rows.length > 1 ? rows.filter((_, itemIndex) => itemIndex !== index) : [{ key: '', value: '' }])}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Use simple labels and values students can understand before booking.</p>
                        </div>
                        <div className="grid gap-3">
                            <label className="flex items-center gap-3 text-sm font-medium" htmlFor="requires_training">
                                <input
                                    type="checkbox"
                                    id="requires_training"
                                    checked={formData.requires_training}
                                    onChange={e => setFormData({ ...formData, requires_training: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                Requires verified training approval before booking
                            </label>
                            <label className="flex items-center gap-3 text-sm font-medium" htmlFor="is_active">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                Machine is active and available for booking
                            </label>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={submitting}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete machine?"
                description={`Delete "${deleteTarget?.name || 'this machine'}"? Machines with booking history will be deactivated instead of permanently deleted.`}
                confirmLabel="Delete machine"
                destructive
                loading={deleteLoading}
                onConfirm={handleDelete}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            />
        </div>
    );
};

export default MachineManager;
