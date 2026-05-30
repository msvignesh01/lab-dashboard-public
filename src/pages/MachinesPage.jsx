import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import MachineCard from '@/components/machines/MachineCard';
import { machineService } from '@/services/machineService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, X } from 'lucide-react';
import { DEPARTMENTS } from '@/lib/constants';

import BookingModal from '@/components/bookings/BookingModal';
import MachineDetailsModal from '@/components/machines/MachineDetailsModal';
import StateMessage from '@/components/StateMessage';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

const MachinesPage = () => {
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({ department: '', location: '' });
    const [showFilters, setShowFilters] = useState(false);

    // Modal state
    const [selectedMachine, setSelectedMachine] = useState(null);
    const [isBookModalOpen, setIsBookModalOpen] = useState(false);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    const fetchMachines = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { data, error } = await machineService.getMachines(filters);
        if (error) {
            setError(error);
            setMachines([]);
        } else {
            setMachines(data || []);
        }
        setLoading(false);
    }, [filters]);

    useEffect(() => {
        fetchMachines(); // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchMachines]);

    const filteredMachines = machines.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.description?.toLowerCase().includes(search.toLowerCase())
    );

    const handleBook = (machine) => {
        setSelectedMachine(machine);
        setIsBookModalOpen(true);
    };

    const handleDetails = (machine) => {
        setSelectedMachine(machine);
        setIsDetailsModalOpen(true);
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Machines & Equipment</h1>
                        <p className="text-muted-foreground">Browse available lab resources for your projects.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search..."
                                className="pl-9 w-full"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="w-full sm:w-auto min-h-[44px]">
                            <Filter className="h-4 w-4 mr-2" /> Filters
                        </Button>
                    </div>
                </div>

                {showFilters && (
                    <div className="bg-card p-4 rounded-lg border flex flex-wrap gap-4 items-end">
                        <div className="space-y-2 min-w-[200px]">
                            <label className="text-sm font-medium">Department</label>
                            <select
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={filters.department}
                                onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                            >
                                <option value="">All Departments</option>
                                {DEPARTMENTS.map(department => (
                                    <option key={department} value={department}>{department}</option>
                                ))}
                            </select>
                        </div>
                        {/* Add more filters here */}
                        <Button variant="ghost" onClick={() => setFilters({ department: '', location: '' })} aria-label="Reset filters">
                            <X className="h-4 w-4 mr-2" />Reset
                        </Button>
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-80 bg-muted animate-pulse rounded-xl" />
                        ))}
                    </div>
                ) : error ? (
                    <StateMessage
                        type="error"
                        title="Unable to load machines"
                        description={error.message || 'The machine catalog is temporarily unavailable.'}
                        actionLabel="Try again"
                        onAction={fetchMachines}
                    />
                ) : (
                    <>
                        <motion.div
                            variants={container}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                        >
                            {filteredMachines.map(machine => (
                                <motion.div key={machine.id} variants={item}>
                                    <MachineCard
                                        machine={machine}
                                        onBook={handleBook}
                                        onDetails={handleDetails}
                                    />
                                </motion.div>
                            ))}
                        </motion.div>
                        {filteredMachines.length === 0 && (
                            <StateMessage
                                title="No machines found"
                                description="No active machines match the current search and filters."
                                actionLabel="Reset filters"
                                onAction={() => {
                                    setSearch('');
                                    setFilters({ department: '', location: '' });
                                }}
                            />
                        )}
                    </>
                )}
            </div>

            {isBookModalOpen && (
                <BookingModal
                    machine={selectedMachine}
                    isOpen={isBookModalOpen}
                    onClose={() => setIsBookModalOpen(false)}
                    onSuccess={() => {
                        // Optionally refresh machines or show confetti
                    }}
                />
            )}


            {isDetailsModalOpen && (
                <MachineDetailsModal
                    machine={selectedMachine}
                    isOpen={isDetailsModalOpen}
                    onClose={() => setIsDetailsModalOpen(false)}
                    onBook={() => {
                        setIsDetailsModalOpen(false);
                        setIsBookModalOpen(true);
                    }}
                />
            )}
        </DashboardLayout>
    );
};

export default MachinesPage;
