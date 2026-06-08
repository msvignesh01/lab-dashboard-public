import React, { useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Menu, Microscope, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getDashboardNavItems } from '@/lib/navigation.jsx';
import CreatorCredit from '@/components/CreatorCredit';
import NotificationCenter from '@/components/notifications/NotificationCenter';

const MobileNav = ({ navItems, currentPath, onSignOut }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open navigation menu">
                <Menu className="h-6 w-6" />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-4/5 max-w-sm translate-x-0 translate-y-0 flex-col rounded-none border-l-0 border-y-0 p-6 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
                    <DialogHeader className="text-left">
                        <DialogTitle className="flex items-center gap-2 text-xl text-primary">
                            <Microscope className="h-6 w-6" />
                            AML Lab
                        </DialogTitle>
                    </DialogHeader>
                    <nav className="mt-6 flex flex-col gap-2" aria-label="Mobile navigation">
                        {navItems.map(item => (
                            <Link
                                key={item.href}
                                to={item.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                                    currentPath === item.href ? "bg-primary/10 text-primary" : "text-foreground"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.name}
                            </Link>
                        ))}
                        <button
                            onClick={() => {
                                setOpen(false);
                                onSignOut();
                            }}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                            <LogOut className="h-5 w-5" />
                            Sign Out
                        </button>
                    </nav>
                    <CreatorCredit compact className="mt-auto pt-6" />
                </DialogContent>
            </Dialog>
        </div>
    );
};

const DashboardLayout = ({ children }) => {
    const { profile, signOut } = useAuth();
    const location = useLocation();
    const navItems = getDashboardNavItems(profile);

    return (
        <div className="flex min-h-[100dvh] bg-background">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0">
                Skip to main content
            </a>
            <AppSidebar />

            <div className="flex-1 flex min-h-[100dvh] flex-col overflow-y-auto">
                <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur md:hidden">
                    <MobileNav navItems={navItems} currentPath={location.pathname} onSignOut={signOut} />
                    <span className="font-semibold">AML Lab</span>
                    <div className="ml-auto">
                        <NotificationCenter />
                    </div>
                </header>

                <main id="main-content" className="flex-1 p-4 pb-24 pt-6 md:p-8">
                    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
                        {children}
                    </div>
                </main>
                <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden" aria-label="Primary mobile navigation">
                    <div className="grid grid-cols-4 gap-1">
                        {navItems.slice(0, 4).map((item) => {
                            const active = location.pathname === item.href.split('?')[0]
                            return (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    className={cn(
                                        "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium",
                                        active ? "bg-primary/10 text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    <item.icon className="h-5 w-5" />
                                    <span className="max-w-full truncate">{item.name}</span>
                                </Link>
                            )
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
};

export default DashboardLayout;
