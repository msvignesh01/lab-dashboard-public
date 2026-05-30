import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { bookingService } from '@/services/bookingService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { securityUtils } from '@/lib/security';
import { BOOKING_LIMITS } from '@/lib/constants';
import { addDaysToLocalDateString, validateBookingWindow } from '@/lib/bookingValidation';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
    { id: 1, title: 'Time' },
    { id: 2, title: 'Details' },
    { id: 3, title: 'Confirm' }
];

const BookingForm = ({ machine, onSuccess, onCancel }) => {
    const [step, setStep] = useState(1);
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '09:00',
        endTime: '10:00',
        purpose: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormError('');
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Prevent double submission
        if (loading) return;

        setLoading(true);
        try {
            const validation = validateBookingWindow({
                booking_date: formData.date,
                start_time: formData.startTime,
                end_time: formData.endTime,
            });
            if (!validation.valid) {
                setFormError(validation.message);
                toast.error(validation.message);
                setLoading(false);
                return;
            }

            const { data: _data, error } = await bookingService.createBooking({
                machine_id: machine.id,
                student_id: user.id,
                booking_date: formData.date,
                start_time: formData.startTime + ':00',
                end_time: formData.endTime + ':00',
                purpose: formData.purpose.trim(),
                status: 'pending'
            });

            if (error) {
                // Check for specific error messages like overlapping
                if (error.message?.includes('overlapping') || error.message?.includes('conflict')) {
                    toast.error("This time slot is no longer available.");
                } else {
                    toast.error(error.message || 'Failed to create booking.');
                }
            } else {
                toast.success('Booking request sent successfully!');
                onSuccess();
            }
        } catch (error) {
            securityUtils.secureLog('error', 'Booking error', error?.message);
            toast.error('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        // Validate current step before proceeding
        if (step === 1) {
            const validation = validateBookingWindow({
                booking_date: formData.date,
                start_time: formData.startTime,
                end_time: formData.endTime,
            });
            if (!validation.valid) {
                setFormError(validation.message);
                toast.error(validation.message);
                return;
            }
            setFormError('');
        }
        if (step === 2) {
            if (!formData.purpose.trim()) {
                setFormError('Please provide a purpose for the booking');
                toast.error('Please provide a purpose for the booking');
                return;
            }
            setFormError('');
        }
        setStep(s => Math.min(s + 1, 3));
    };
    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    return (
        <div className="w-full">
            {/* Progress Steps */}
            <div className="flex items-center justify-between mb-8 px-2 relative">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -z-10" />
                {steps.map((s) => (
                    <motion.div
                        key={s.id}
                        initial={false}
                        animate={{
                            backgroundColor: step >= s.id ? "var(--primary)" : "var(--background)",
                            borderColor: step >= s.id ? "var(--primary)" : "var(--muted)",
                            color: step >= s.id ? "var(--primary-foreground)" : "var(--muted-foreground)"
                        }}
                        className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 relative`}
                    >
                        {step > s.id ? <Check className="h-4 w-4" /> : s.id}
                        <span className="absolute -bottom-6 text-[10px] font-medium text-foreground whitespace-nowrap hidden sm:block">{s.title}</span>
                    </motion.div>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-4">
                <AnimatePresence mode='wait'>
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date</label>
                                <Input
                                    type="date"
                                    name="date"
                                    min={format(new Date(), 'yyyy-MM-dd')}
                                    max={addDaysToLocalDateString(new Date(), BOOKING_LIMITS.MAX_ADVANCE_DAYS)}
                                    value={formData.date}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Start Time</label>
                                    <Input type="time" name="startTime" value={formData.startTime} onChange={handleChange} required />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">End Time</label>
                                    <Input type="time" name="endTime" value={formData.endTime} onChange={handleChange} required />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Purpose of Use</label>
                                <Input
                                    placeholder="E.g., Senior Project Experiment"
                                    name="purpose"
                                    value={formData.purpose}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                                <p>Please ensure you are trained to use this equipment. Faculty approval may be required.</p>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <Card className="bg-muted/30 border-dashed">
                                <CardContent className="pt-6 space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Machine:</span>
                                        <span className="font-medium">{machine.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Date:</span>
                                        <span className="font-medium">{formData.date}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Time:</span>
                                        <span className="font-medium">{formData.startTime} - {formData.endTime}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>

                {formError && (
                    <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                        {formError}
                    </p>
                )}

                <div className="flex justify-between mt-8">
                    {step === 1 ? (
                        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                    ) : (
                        <Button type="button" variant="outline" onClick={prevStep}>Back</Button>
                    )}

                    {step < 3 ? (
                        <Button type="button" onClick={nextStep}>
                            Next <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Confirm Booking'}</Button>
                    )}
                </div>
            </form>
        </div>
    );
};

export default BookingForm;
