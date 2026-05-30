import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, AlertCircle, Plus, Microscope } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { bookingService } from '@/services/bookingService';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { format, isFuture } from 'date-fns';
import { parseDateOnlyToLocalDate } from '@/lib/bookingValidation';
import StateMessage from '@/components/StateMessage';

const BentoGridItem = ({ className, children, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay }}
        className={className}
    >
        {children}
    </motion.div>
);

const StudentDashboard = () => {
    const { user, profile } = useAuth();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchBookings = React.useCallback(() => {
        if (user) {
            setLoading(true);
            setError(null);
            bookingService.getMyBookings(user.id).then(({ data, error }) => {
                if (error) {
                    setError(error);
                    setBookings([]);
                } else {
                    setBookings(data || []);
                }
                setLoading(false);
            });
        }
    }, [user]);

    useEffect(() => {
        fetchBookings(); // eslint-disable-line react-hooks/set-state-in-effect
    }, [fetchBookings]);

    const upcomingBookings = bookings
        .filter(b => {
            const dt = new Date(`${b.booking_date}T${b.start_time}`);
            return isFuture(dt) && ['approved', 'pending'].includes(b.status);
        })
        .slice(0, 5);

    const stats = {
        activeBookings: bookings.filter(b => b.status === 'approved' && isFuture(new Date(`${b.booking_date}T${b.start_time}`))).length,
        pendingRequests: bookings.filter(b => b.status === 'pending').length,
        totalBookings: bookings.length,
    };

    return (
        <div className="space-y-6">
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Welcome to Additive Manufacturing Lab</h2>
                    <p className="text-muted-foreground">Here's what's happening in your lab today, {profile?.full_name?.split(' ')[0] || 'Student'}.</p>
                </div>
                <div className="flex gap-2">
                    <Button asChild>
                        <Link to="/machines">
                            <Plus className="mr-2 h-4 w-4" /> New Booking
                        </Link>
                    </Button>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <BentoGridItem className="col-span-1 sm:col-span-2 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border p-6 flex flex-col justify-between" delay={0.1}>
                    <div className="space-y-1">
                        <span className="text-sm font-medium text-muted-foreground">Total Bookings</span>
                        <div className="text-4xl font-bold tracking-tighter">{stats.totalBookings}</div>
                    </div>
                    <div className="mt-4">
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${Math.min((stats.totalBookings / 50) * 100, 100)}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Lifetime lab usage</p>
                    </div>
                </BentoGridItem>

                <BentoGridItem className="sm:col-span-1 bg-card rounded-xl border p-6 flex flex-col justify-between" delay={0.2}>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Active</span>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">{stats.activeBookings}</div>
                        <p className="text-xs text-muted-foreground">Bookings upcoming</p>
                    </div>
                </BentoGridItem>

                <BentoGridItem className="sm:col-span-1 bg-card rounded-xl border p-6 flex flex-col justify-between" delay={0.3}>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Pending</span>
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">{stats.pendingRequests}</div>
                        <p className="text-xs text-muted-foreground">Awaiting approval</p>
                    </div>
                </BentoGridItem>

                <BentoGridItem className="sm:col-span-2 rounded-xl border bg-card overflow-hidden" delay={0.4}>
                    <div className="p-6 border-b flex items-center justify-between">
                        <h3 className="font-semibold">Upcoming Bookings</h3>
                        <Button variant="ghost" size="sm" className="text-xs" asChild>
                            <Link to="/bookings">View All</Link>
                        </Button>
                    </div>
                    <div className="p-0">
                        {loading ? (
                            <div className="p-4 space-y-3">
                                {[1, 2].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
                            </div>
                        ) : error ? (
                            <div className="p-4">
                                <StateMessage
                                    type="error"
                                    title="Unable to load bookings"
                                    description={error.message || 'Your booking summary is temporarily unavailable.'}
                                    actionLabel="Try again"
                                    onAction={fetchBookings}
                                />
                            </div>
                        ) : upcomingBookings.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                No upcoming bookings. <Link to="/machines" className="text-primary hover:underline">Browse machines</Link> to get started.
                            </div>
                        ) : (
                            upcomingBookings.map((booking) => {
                                const bookingDate = parseDateOnlyToLocalDate(booking.booking_date);
                                return (
                                <div key={booking.id} className="flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                                            <Microscope className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{booking.machines?.name || 'Machine'}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {bookingDate ? format(bookingDate, 'MMM d') : 'Invalid date'} at {booking.start_time?.slice(0, 5)}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={booking.status === 'approved' ? 'success' : 'warning'}>
                                        {booking.status}
                                    </Badge>
                                </div>
                                );
                            })
                        )}
                    </div>
                </BentoGridItem>

                <BentoGridItem className="sm:col-span-2 md:col-span-1 rounded-xl border bg-card p-6 space-y-4" delay={0.5}>
                    <h3 className="font-semibold">Quick Actions</h3>
                    <div className="grid gap-2">
                        <Button variant="outline" className="w-full justify-start h-auto py-3" asChild>
                            <Link to="/machines">
                                <Microscope className="mr-2 h-4 w-4" /> Browse Machines
                            </Link>
                        </Button>
                        <Button variant="outline" className="w-full justify-start h-auto py-3" asChild>
                            <Link to="/bookings">
                                <Clock className="mr-2 h-4 w-4" /> My Bookings
                            </Link>
                        </Button>
                        <Button variant="outline" className="w-full justify-start h-auto py-3" asChild>
                            <Link to="/bookings">
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Track Status
                            </Link>
                        </Button>
                    </div>
                </BentoGridItem>
            </div>
        </div>
    );
};

export default StudentDashboard;
