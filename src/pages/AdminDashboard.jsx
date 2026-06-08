import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import FacultyDashboard from '@/components/dashboard/FacultyDashboard';
import MachineManager from '@/components/admin/MachineManager';
import FacultyRequestsManager from '@/components/admin/FacultyRequestsManager';
import OperationsSchedule from '@/components/admin/OperationsSchedule';
import MaintenanceManager from '@/components/admin/MaintenanceManager';
import TrainingManager from '@/components/admin/TrainingManager';
import UsersManager from '@/components/admin/UsersManager';
import LabConfigManager from '@/components/admin/LabConfigManager';
import AuditLogViewer from '@/components/admin/AuditLogViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

const AdminDashboard = () => {
    const { profile } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const isAdmin = profile?.role === 'admin';
    const availableTabs = useMemo(() => {
        const tabs = ['overview', 'schedule', 'machines', 'maintenance', 'training', 'audit'];
        if (isAdmin) tabs.push('faculty', 'users', 'settings');
        return tabs;
    }, [isAdmin]);
    const requestedTab = searchParams.get('tab') || 'overview';
    const [activeTab, setActiveTab] = useState(availableTabs.includes(requestedTab) ? requestedTab : 'overview');

    useEffect(() => {
        if (!availableTabs.includes(activeTab)) {
            setActiveTab('overview'); // eslint-disable-line react-hooks/set-state-in-effect
        }
    }, [activeTab, availableTabs]);

    const handleTabChange = (value) => {
        setActiveTab(value);
        setSearchParams(value === 'overview' ? {} : { tab: value });
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{isAdmin ? 'Admin Console' : 'Operations'}</h2>
                    <p className="text-muted-foreground">Review bookings, manage machine availability, and keep the lab schedule reliable.</p>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
                    <div className="w-full overflow-x-auto pb-2 relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent z-10 md:hidden" />
                        <TabsList className="w-max">
                            <TabsTrigger value="overview">Review Queue</TabsTrigger>
                            <TabsTrigger value="schedule">Schedule</TabsTrigger>
                            <TabsTrigger value="machines">Machines</TabsTrigger>
                            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                            <TabsTrigger value="training">Training</TabsTrigger>
                            <TabsTrigger value="audit">Audit</TabsTrigger>
                            {isAdmin && <TabsTrigger value="faculty">Faculty Access</TabsTrigger>}
                            {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
                            {isAdmin && <TabsTrigger value="settings">Lab Settings</TabsTrigger>}
                        </TabsList>
                    </div>
                    <TabsContent value="overview" className="space-y-4">
                        <FacultyDashboard />
                    </TabsContent>
                    <TabsContent value="schedule" className="space-y-4">
                        <OperationsSchedule />
                    </TabsContent>
                    <TabsContent value="machines" className="space-y-4">
                        <MachineManager />
                    </TabsContent>
                    <TabsContent value="maintenance" className="space-y-4">
                        <MaintenanceManager />
                    </TabsContent>
                    <TabsContent value="training" className="space-y-4">
                        <TrainingManager />
                    </TabsContent>
                    <TabsContent value="audit" className="space-y-4">
                        <AuditLogViewer />
                    </TabsContent>
                    {isAdmin && (
                        <TabsContent value="faculty" className="space-y-4">
                            <FacultyRequestsManager />
                        </TabsContent>
                    )}
                    {isAdmin && (
                        <TabsContent value="users" className="space-y-4">
                            <UsersManager />
                        </TabsContent>
                    )}
                    {isAdmin && (
                        <TabsContent value="settings" className="space-y-4">
                            <LabConfigManager />
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </DashboardLayout>
    );
};

export default AdminDashboard;
