import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import FacultyDashboard from '@/components/dashboard/FacultyDashboard';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { LoadingGate } from '@/components/auth/AccountGate';

const Dashboard = () => {
    const { profile, loading } = useAuth();

    if (loading) {
        return <LoadingGate message="Loading dashboard..." />;
    }

    const isFaculty = profile?.role === 'faculty' || profile?.role === 'admin';

    return (
        <DashboardLayout>
            {isFaculty ? <FacultyDashboard /> : <StudentDashboard />}
        </DashboardLayout>
    );
};

export default Dashboard;
