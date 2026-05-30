import { Calendar, LayoutDashboard, Microscope, Settings } from 'lucide-react'

export const getDashboardNavItems = (profile) => {
    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Machines', href: '/machines', icon: Microscope },
        { name: 'Bookings', href: '/bookings', icon: Calendar },
    ]

    if (profile?.status === 'active' && (profile.role === 'admin' || profile.role === 'faculty')) {
        navItems.push({ name: 'Admin Panel', href: '/admin', icon: Settings })
    }

    return navItems
}
