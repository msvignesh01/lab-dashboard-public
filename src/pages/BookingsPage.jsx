import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { bookingService } from '@/services/bookingService';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar, Clock, MapPin, FileText, X, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow, isPast, isFuture } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';
import { parseDateOnlyToLocalDate } from '@/lib/bookingValidation';
import StateMessage from '@/components/StateMessage';
import ConfirmDialog from '@/components/ConfirmDialog';

const statusConfig = {
    pending: { label: 'Pending', variant: 'warning', icon: Clock },
    approved: { label: 'Approved', variant: 'success', icon: null },
    rejected: { label: 'Rejected', variant: 'destructive', icon: X },
    cancelled: { label: 'Cancelled', variant: 'secondary', icon: null },
};

const BookingCard = ({ booking, onCancel, onViewDetails }) => {
    const machine = booking.machines || {};
    const config = statusConfig[booking.status] || statusConfig.pending;
    const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}`);
    const isUpcoming = isFuture(bookingStart);
    const canCancel = ['pending', 'approved'].includes(booking.status) && isUpcoming;
    const bookingDate = parseDateOnlyToLocalDate(booking.booking_date);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            layout
        >
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between md:justify-start gap-3">
                                <h3 className="font-semibold text-lg">{machine.name || 'Unknown Machine'}</h3>
                                <Badge variant={config.variant}>{config.label}</Badge>
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {bookingDate ? format(bookingDate, 'MMM d, yyyy') : 'Invalid date'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}
                                </span>
                                {machine.location && (
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {machine.location}
                                    </span>
                                )}
                            </div>

                            {booking.purpose && (
                                <p className="text-sm text-muted-foreground flex items-start gap-1">
                                    <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    {booking.purpose}
                                </p>
                            )}

                            {booking.faculty_comments && booking.status === 'rejected' && (
                                <div className="mt-2 p-3 bg-destructive/10 rounded-md text-sm">
                                    <span className="font-medium text-destructive">Faculty Comments: </span>
                                    {booking.faculty_comments}
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground">
                                Submitted {formatDistanceToNow(new Date(booking.created_at), { addSuffix: true })}
                            </p>
                        </div>

                        <div className="flex flex-row md:flex-col gap-2 shrink-0">
                            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => onViewDetails(booking)}>
                                View Details
                            </Button>
                            {canCancel && (
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive min-h-[44px]" onClick={() => onCancel(booking)}>
                                    Cancel
                                </Button>
                            )}
                            {booking.status === 'rejected' && (
                                <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
                                    <Link to="/machines">Book Again</Link>
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

const BookingsPage = () => {
    const { user } = useAuth();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [bookingToCancel, setBookingToCancel] = useState(null);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [realtimeError, setRealtimeError] = useState(false); // eslint-disable-line no-unused-vars -- set by realtime handler, shown via toast
    const [loadError, setLoadError] = useState(null);

    const fetchBookings = useCallback(async () => {
        setLoading(true);
        const { data, error } = await bookingService.getMyBookings(user.id);
        if (error) {
            setLoadError(error);
            toast.error('Failed to load bookings');
        } else {
            setLoadError(null);
            setBookings(data || []);
        }
        setLoading(false);
    }, [user.id]);

    useEffect(() => {
        if (user) {
            setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
            const unsubscribe = bookingService.subscribeToMyBookings(
                user.id,
                (data) => {
                    setBookings(data || []);
                    setRealtimeError(false);
                    setLoadError(null);
                    setLoading(false);
                },
                (err) => {
                    setRealtimeError(true);
                    setLoadError(err);
                    setLoading(false);
                    toast.error('Realtime connection lost. Please refresh for latest updates.');
                    fetchBookings();
                },
            );
            return unsubscribe;
        }
    }, [user, fetchBookings]);

    // I4: Use cancelBooking instead of updateBookingStatus for proper ownership check
    const handleCancel = async () => {
        if (!bookingToCancel) return;
        setCancelLoading(true);
        const { error } = await bookingService.cancelBooking(bookingToCancel.id, user.id);
        setCancelLoading(false);
        if (error) {
            toast.error(error.message || 'Failed to cancel booking');
        } else {
            toast.success('Booking cancelled');
            setBookingToCancel(null);
            fetchBookings();
        }
    };

    const filteredBookings = bookings.filter(b => {
        if (activeTab === 'all') return true;
        if (activeTab === 'past') {
            const dt = new Date(`${b.booking_date}T${b.end_time}`);
            return isPast(dt) && b.status !== 'cancelled';
        }
        return b.status === activeTab;
    });

    const tabCounts = {
        all: bookings.length,
        pending: bookings.filter(b => b.status === 'pending').length,
        approved: bookings.filter(b => b.status === 'approved').length,
        rejected: bookings.filter(b => b.status === 'rejected').length,
        past: bookings.filter(b => isPast(new Date(`${b.booking_date}T${b.end_time}`)) && b.status !== 'cancelled').length,
    };
    const selectedBookingDate = selectedBooking ? parseDateOnlyToLocalDate(selectedBooking.booking_date) : null;

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
                        <p className="text-muted-foreground">Track and manage your lab equipment bookings.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <Button variant="outline" size="sm" onClick={fetchBookings} className="w-full sm:w-auto">
                            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                        </Button>
                        <Button size="sm" asChild className="w-full sm:w-auto">
                            <Link to="/machines">
                                New Booking <ArrowRight className="h-4 w-4 ml-2" />
                            </Link>
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="w-full overflow-x-auto pb-2 relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent z-10 md:hidden" />
                        <TabsList className="w-full justify-start">
                            <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                            <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
                            <TabsTrigger value="approved">Approved ({tabCounts.approved})</TabsTrigger>
                            <TabsTrigger value="rejected">Rejected ({tabCounts.rejected})</TabsTrigger>
                            <TabsTrigger value="past">Past ({tabCounts.past})</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value={activeTab} className="mt-4">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
                                ))}
                            </div>
                        ) : loadError ? (
                            <StateMessage
                                type="error"
                                title="Unable to load bookings"
                                description={loadError.message || 'Your bookings are temporarily unavailable.'}
                                actionLabel="Try again"
                                onAction={fetchBookings}
                            />
                        ) : filteredBookings.length === 0 ? (
                            <StateMessage
                                title="No bookings found"
                                description="You have not made any booking requests yet. Browse equipment to get started."
                                actionLabel="Browse Machines"
                                actionHref="/machines"
                            />
                        ) : (
                            <div className="space-y-4">
                                <AnimatePresence>
                                    {filteredBookings.map(booking => (
                                        <BookingCard
                                            key={booking.id}
                                            booking={booking}
                                            onCancel={setBookingToCancel}
                                            onViewDetails={setSelectedBooking}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Booking Detail Modal */}
            <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Booking Details</DialogTitle>
                    </DialogHeader>
                    {selectedBooking && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-lg">{selectedBooking.machines?.name}</h3>
                                <Badge variant={statusConfig[selectedBooking.status]?.variant}>
                                    {statusConfig[selectedBooking.status]?.label}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground block">Date</span>
                                    <span className="font-medium">
                                        {selectedBookingDate ? format(selectedBookingDate, 'MMMM d, yyyy') : 'Invalid date'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Time</span>
                                    <span className="font-medium">{selectedBooking.start_time?.slice(0, 5)} - {selectedBooking.end_time?.slice(0, 5)}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Location</span>
                                    <span className="font-medium">{selectedBooking.machines?.location || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Department</span>
                                    <span className="font-medium">{selectedBooking.machines?.department || 'N/A'}</span>
                                </div>
                            </div>

                            {selectedBooking.purpose && (
                                <div>
                                    <span className="text-sm text-muted-foreground block">Purpose</span>
                                    <p className="text-sm font-medium">{selectedBooking.purpose}</p>
                                </div>
                            )}

                            {selectedBooking.faculty_comments && (
                                <div className="p-3 border rounded-md bg-muted/30">
                                    <span className="text-sm text-muted-foreground block mb-1">Faculty Comments</span>
                                    <p className="text-sm">{selectedBooking.faculty_comments}</p>
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground">
                                Booking ID: {selectedBooking.id?.slice(0, 8)}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedBooking(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!bookingToCancel}
                title="Cancel booking?"
                description="This will release the reserved slot and cannot be undone."
                confirmLabel="Cancel booking"
                destructive
                loading={cancelLoading}
                onConfirm={handleCancel}
                onOpenChange={(open) => {
                    if (!open) setBookingToCancel(null);
                }}
            />
        </DashboardLayout>
    );
};

export default BookingsPage;
