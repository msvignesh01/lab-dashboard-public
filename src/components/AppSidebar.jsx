import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    Microscope,
    LogOut,
    ChevronLeft,
    ChevronRight,
    UserCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// eslint-disable-next-line no-unused-vars -- motion.aside/motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { securityUtils } from '@/lib/security';
import ProfileModal from '@/components/profile/ProfileModal';
import { getDashboardNavItems } from '@/lib/navigation.jsx';

export function AppSidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [avatarHash, setAvatarHash] = useState('default');
    const { profile, signOut } = useAuth();

    useEffect(() => {
        if (profile?.email) {
            securityUtils.hashForAvatar(profile.email).then(setAvatarHash);
        }
    }, [profile?.email]);

    const navItems = getDashboardNavItems(profile);

    return (
        <>
            <motion.aside
                initial={false}
                animate={{ width: collapsed ? 80 : 250 }}
                className={cn(
                    "relative z-30 hidden min-h-[100dvh] flex-col border-r bg-card md:flex overflow-visible"
                )}
                role="navigation"
                aria-label="Main navigation"
            >
                <div className="flex h-16 items-center justify-between px-4">
                    <AnimatePresence mode='wait'>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2 font-bold text-xl text-primary"
                            >
                                <Microscope className="h-6 w-6" />
                                <span>AML Lab</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {collapsed && (
                        <div className="mx-auto text-primary">
                            <Microscope className="h-6 w-6" />
                        </div>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-3 top-6 h-6 w-6 rounded-full border bg-background shadow-md hidden md:flex"
                        onClick={() => setCollapsed(!collapsed)}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                    </Button>
                </div>

                <div className="flex-1 space-y-2 py-4 px-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.href}
                            to={item.href}
                            end={item.href === '/'}
                            className={({ isActive }) =>
                                cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                                    collapsed && "justify-center px-2"
                                )
                            }
                            title={collapsed ? item.name : undefined}
                            aria-label={collapsed ? item.name : undefined}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.span
                                        initial={{ opacity: 0, width: 0 }}
                                        animate={{ opacity: 1, width: "auto" }}
                                        exit={{ opacity: 0, width: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="whitespace-nowrap overflow-hidden"
                                    >
                                        {item.name}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </NavLink>
                    ))}
                </div>

                <div className="border-t p-2">
                    <div
                        className={cn("flex items-center gap-3 rounded-md p-2 bg-muted/50 cursor-pointer hover:bg-muted transition-colors", collapsed && "justify-center")}
                        onClick={() => setIsProfileOpen(true)}
                        role="button"
                        tabIndex={0}
                        aria-label="View profile"
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsProfileOpen(true); } }}
                    >
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://avatar.vercel.sh/${avatarHash}`} />
                            <AvatarFallback><UserCircle className="h-6 w-6" /></AvatarFallback>
                        </Avatar>
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.div
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: "auto" }}
                                    exit={{ opacity: 0, width: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex-1 overflow-hidden"
                                >
                                    <p className="truncate text-sm font-medium">{profile?.full_name}</p>
                                    <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    <Button
                        variant="ghost"
                        className={cn("mt-2 w-full justify-start text-destructive hover:text-destructive", collapsed && "justify-center")}
                        onClick={signOut}
                        aria-label="Sign out"
                    >
                        <LogOut className="h-4 w-4 shrink-0" />
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.span
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: "auto" }}
                                    exit={{ opacity: 0, width: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="ml-2 whitespace-nowrap overflow-hidden"
                                >
                                    Sign Out
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Button>
                </div>
            </motion.aside>

            <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
        </>
    );
}
