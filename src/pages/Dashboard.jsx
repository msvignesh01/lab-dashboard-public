import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import FacultyDashboard from '@/components/dashboard/FacultyDashboard';
import DashboardLayout from '@/components/layouts/DashboardLayout';

const Dashboard = () => {
    const { profile, loading } = useAuth();

    if (loading) {
        return <div className="flex min-h-[100dvh] items-center justify-center">Loading dashboard...</div>;
    }

    const isFaculty = profile?.role === 'faculty' || profile?.role === 'admin';

    return (
        <DashboardLayout>
            {isFaculty ? <FacultyDashboard /> : <StudentDashboard />}
        </DashboardLayout>
    );
};

export default Dashboard;
