import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Info, ShieldCheck } from 'lucide-react';
import { securityUtils } from '@/lib/security';

const MachineDetailsModal = ({ machine, isOpen, onClose, onBook }) => {
    if (!machine) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <div className="flex items-center justify-between mr-4">
                        <DialogTitle>{machine.name}</DialogTitle>
                        <Badge variant={machine.is_active ? "success" : "destructive"}>
                            {machine.is_active ? "Available" : "Unavailable"}
                        </Badge>
                    </div>
                    <DialogDescription>View machine specifications, location, and availability details.</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted max-h-[30vh]">
                        {securityUtils.isSafeImageUrl(machine.image_url) ? (
                            <img src={machine.image_url} alt={machine.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary/50 text-muted-foreground">
                                <Info className="h-16 w-16 opacity-20" />
                            </div>
                        )}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Location</h3>
                            <div className="flex items-center mt-1">
                                <MapPin className="h-4 w-4 mr-2 text-primary" />
                                <span>{machine.location || "N/A"}</span>
                            </div>
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Department</h3>
                            <div className="mt-1">
                                <span>{machine.department || "General"}</span>
                            </div>
                        </div>
                    </div>

                    {machine.specifications && Object.keys(machine.specifications).length > 0 && (
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Specifications</h3>
                            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                {Object.entries(machine.specifications).map(([key, value]) => (
                                    <div key={key} className="flex justify-between gap-4 text-sm">
                                        <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                                        <span className="font-medium text-right">{String(value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {machine.requires_training && (
                        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                            <p className="text-sm text-foreground">
                                This machine requires verified training approval before it can be booked.
                            </p>
                        </div>
                    )}

                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
                        <p className="text-foreground/80 leading-relaxed">
                            {machine.description || "No description available."}
                        </p>
                    </div>
                </div>

                <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
                    <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Close</Button>
                    <Button
                        onClick={() => { onClose(); onBook(machine); }}
                        disabled={!machine.is_active}
                        className="w-full sm:w-auto"
                    >
                        Book This Machine
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default MachineDetailsModal;
