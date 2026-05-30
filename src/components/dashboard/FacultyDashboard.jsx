import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Check, X, Clock, User, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { bookingService } from '@/services/bookingService';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { parseDateOnlyToLocalDate } from '@/lib/bookingValidation';
import StateMessage from '@/components/StateMessage';
import ConfirmDialog from '@/components/ConfirmDialog';

const FacultyDashboard = () => {
    const [pendingBookings, setPendingBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null); // Track which booking is being processed
    const [realtimeError, setRealtimeError] = useState(false); // eslint-disable-line no-unused-vars -- set by realtime handler, shown via toast
    const [rejectModal, setRejectModal] = useState({ open: false, booking: null });
    const [rejectReason, setRejectReason] = useState('');
    const [rejectLoading, setRejectLoading] = useState(false);
    const [detailBooking, setDetailBooking] = useState(null);
    const [approveTarget, setApproveTarget] = useState(null);
    const detailBookingDate = detailBooking ? parseDateOnlyToLocalDate(detailBooking.booking_date) : null;

    const fetchPending = useCallback(async () => {
        setLoading(true);
        const { data, error } = await bookingService.getPendingBookings();
        if (error) {
            setLoadError(error);
            setPendingBookings([]);
        } else {
            setLoadError(null);
            setPendingBookings(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
        const unsubscribe = bookingService.subscribeToPendingBookings(
            (data) => {
                setPendingBookings(data);
                setRealtimeError(false);
                setLoadError(null);
                setLoading(false);
            },
            (err) => {
                setRealtimeError(true);
                setLoadError(err);
                setLoading(false);
                toast.error('Realtime connection lost. Please refresh for latest updates.');
                fetchPending();
            },
        );
        return unsubscribe;
    }, [fetchPending]);

    const handleApprove = async (bookingId) => {
        setActionLoading(bookingId);
        const { error } = await bookingService.updateBookingStatus(bookingId, 'approved');
        setActionLoading(null);
        if (error) {
            toast.error(error.message || 'Failed to approve booking');
        } else {
            toast.success('Booking approved');
            setPendingBookings(prev => prev.filter(b => b.id !== bookingId));
            setApproveTarget(null);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) {
            toast.error('Please provide a reason for rejection');
            return;
        }
        if (rejectLoading) return;
        setRejectLoading(true);
        const { error } = await bookingService.updateBookingStatus(rejectModal.booking.id, 'rejected', rejectReason);
        setRejectLoading(false);
        if (error) {
            toast.error('Failed to reject booking');
        } else {
            toast.success('Booking rejected');
            setPendingBookings(prev => prev.filter(b => b.id !== rejectModal.booking.id));
        }
        setRejectModal({ open: false, booking: null });
        setRejectReason('');
    };

    const stats = {
        pending: pendingBookings.length,
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Faculty Dashboard</h2>
                <p className="text-muted-foreground">Manage approvals and oversee lab usage.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" aria-live="polite">{stats.pending}</div>
                        <p className="text-xs text-muted-foreground">Requests awaiting review</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Quick Approve</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Use the approve/reject buttons below each request to process them quickly.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Realtime Updates</CardTitle>
                        <AlertCircle className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">New booking requests appear here automatically via realtime sync.</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Booking Requests</CardTitle>
                    <CardDescription>Review and approve student booking requests.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-4" aria-busy="true" aria-label="Loading bookings">
                            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
                        </div>
                    ) : loadError ? (
                        <StateMessage
                            type="error"
                            title="Unable to load booking requests"
                            description={loadError.message || 'Pending approvals are temporarily unavailable.'}
                            actionLabel="Try again"
                            onAction={fetchPending}
                        />
                    ) : pendingBookings.length === 0 ? (
                        <StateMessage
                            title="No pending requests"
                            description="All caught up. New booking requests will appear here automatically."
                        />
                    ) : (
                        <div className="space-y-4" aria-live="polite">
                            {pendingBookings.map((booking, index) => {
                                const student = booking.profiles || {};
                                const machine = booking.machines || {};
                                const bookingDate = parseDateOnlyToLocalDate(booking.booking_date);
                                return (
                                    <motion.div
                                        key={booking.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors gap-4">
                                        <div className="space-y-1 w-full md:w-auto">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="font-semibold">{machine.name || 'Unknown Machine'}</h4>
                                                {machine.location && (
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        {machine.location}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3.5 w-3.5" />
                                                    {student.full_name || 'Unknown Student'} ({student.role || 'Student'})
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {bookingDate ? format(bookingDate, 'MMM d, yyyy') : 'Invalid date'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}
                                                </span>
                                            </div>
                                            {booking.purpose && (
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    <span className="font-medium">Purpose:</span> {booking.purpose}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                                            <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setDetailBooking(booking)} aria-label={`View details for ${machine.name || 'booking'}`}>
                                                Details
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="min-h-[44px] min-w-[44px] p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                disabled={actionLoading === booking.id}
                                                onClick={() => setRejectModal({ open: true, booking })}
                                                aria-label={`Reject booking for ${machine.name || 'machine'}`}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="min-h-[44px] min-w-[44px] p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                disabled={actionLoading === booking.id}
                                                onClick={() => setApproveTarget(booking)}
                                                aria-label={`Approve booking for ${machine.name || 'machine'}`}
                                            >
                                                {actionLoading === booking.id ? <Clock className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reject Modal */}
            <Dialog open={rejectModal.open} onOpenChange={(open) => { if (!open) { setRejectModal({ open: false, booking: null }); setRejectReason(''); } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject Booking</DialogTitle>
                        <DialogDescription>Provide a reason for rejecting this booking request.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Rejecting {rejectModal.booking?.profiles?.full_name}'s request for {rejectModal.booking?.machines?.name}.
                        </p>
                        <div className="space-y-2">
                            <label htmlFor="reject-reason" className="text-sm font-medium">Reason for rejection *</label>
                            <textarea
                                id="reject-reason"
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="e.g., Equipment under maintenance, reschedule for next week"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setRejectModal({ open: false, booking: null }); setRejectReason(''); }} disabled={rejectLoading}>Cancel</Button>
                        <Button variant="destructive" onClick={handleReject} disabled={rejectLoading}>{rejectLoading ? 'Rejecting...' : 'Reject Booking'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Detail Modal */}
            <Dialog open={!!detailBooking} onOpenChange={() => setDetailBooking(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Booking Request Details</DialogTitle>
                        <DialogDescription>Review student and booking information before approving or rejecting.</DialogDescription>
                    </DialogHeader>
                    {detailBooking && (
                        <div className="space-y-4">
                            <Card className="bg-muted/30">
                                <CardContent className="pt-4 space-y-2 text-sm">
                                    <h4 className="font-semibold">Student Information</h4>
                                    <p>Name: {detailBooking.profiles?.full_name || 'N/A'}</p>
                                    <p>Email: {detailBooking.profiles?.email || 'N/A'}</p>
                                    <p>Department: {detailBooking.profiles?.department || 'N/A'}</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-muted/30">
                                <CardContent className="pt-4 space-y-2 text-sm">
                                    <h4 className="font-semibold">Booking Details</h4>
                                    <p>Machine: {detailBooking.machines?.name}</p>
                                    <p>Location: {detailBooking.machines?.location || 'N/A'}</p>
                                    <p>Date: {detailBookingDate ? format(detailBookingDate, 'MMMM d, yyyy') : 'Invalid date'}</p>
                                    <p>Time: {detailBooking.start_time?.slice(0, 5)} - {detailBooking.end_time?.slice(0, 5)}</p>
                                    <p>Purpose: {detailBooking.purpose || 'Not specified'}</p>
                                    <p className="text-muted-foreground">Submitted {formatDistanceToNow(new Date(detailBooking.created_at), { addSuffix: true })}</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button variant="ghost" onClick={() => setDetailBooking(null)} className="w-full sm:w-auto">Close</Button>
                        <Button variant="destructive" onClick={() => { setDetailBooking(null); setRejectModal({ open: true, booking: detailBooking }); }} className="w-full sm:w-auto">
                            <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                        <Button onClick={() => { setApproveTarget(detailBooking); setDetailBooking(null); }} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                            <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!approveTarget}
                title="Approve booking?"
                description={`Approve ${approveTarget?.profiles?.full_name || 'this student'}'s request for ${approveTarget?.machines?.name || 'this machine'}?`}
                confirmLabel="Approve booking"
                loading={Boolean(actionLoading)}
                onConfirm={() => handleApprove(approveTarget.id)}
                onOpenChange={(open) => {
                    if (!open) setApproveTarget(null);
                }}
            />
        </div>
    );
};

export default FacultyDashboard;
