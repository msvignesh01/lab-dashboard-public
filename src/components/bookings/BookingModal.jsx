import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import BookingForm from './BookingForm';

const BookingModal = ({ machine, isOpen, onClose, onSuccess }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Book {machine?.name}</DialogTitle>
                    <DialogDescription>Select a date, time, and provide a purpose for your booking request.</DialogDescription>
                </DialogHeader>
                <BookingForm
                    machine={machine}
                    onSuccess={() => { onSuccess(); onClose(); }}
                    onCancel={onClose}
                />
            </DialogContent>
        </Dialog>
    );
};

export default BookingModal;
