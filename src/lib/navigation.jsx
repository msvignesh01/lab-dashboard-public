import { Calendar, LayoutDashboard, Microscope, Settings } from 'lucide-react'

export const getDashboardNavItems = (profile) => {
    const canOperate = profile?.status === 'active' && (profile.role === 'admin' || profile.role === 'faculty')
    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Machines', href: '/machines', icon: Microscope },
        { name: 'Bookings', href: '/bookings', icon: Calendar },
    ]

    if (canOperate) {
        navItems.push({
            name: profile.role === 'admin' ? 'Admin Console' : 'Operations',
            href: '/admin',
            icon: Settings,
        })
    }

    return navItems
}
