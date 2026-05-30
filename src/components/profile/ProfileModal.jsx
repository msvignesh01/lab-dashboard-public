import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCircle, Mail, Phone, Building, Briefcase, GraduationCap, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { securityUtils } from '@/lib/security';

const ProfileModal = ({ isOpen, onClose }) => {
    const { profile } = useAuth();
    const [avatarHash, setAvatarHash] = useState('default');

    useEffect(() => {
        if (profile?.email) {
            securityUtils.hashForAvatar(profile.email).then(setAvatarHash);
        }
    }, [profile?.email]);

    const handleCopy = async (text, label) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied to clipboard`);
        } catch {
            toast.error(`Could not copy ${label.toLowerCase()}`);
        }
    };

    if (!profile) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Profile Details</DialogTitle>
                    <DialogDescription>Your account information and university details.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-4 py-4">
                    <Avatar className="h-24 w-24 border-4 border-muted">
                        <AvatarImage src={`https://avatar.vercel.sh/${avatarHash}`} />
                        <AvatarFallback><UserCircle className="h-20 w-20 text-muted-foreground" /></AvatarFallback>
                    </Avatar>

                    <div className="text-center">
                        <h3 className="text-xl font-bold">{profile.full_name}</h3>
                        <p className="text-sm text-muted-foreground capitalize">{profile.role}</p>
                    </div>
                </div>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                            <Mail className="h-4 w-4" /> Email
                        </Label>
                        <div className="flex gap-2">
                            <Input id="email" value={profile.email} readOnly className="bg-muted" />
                            <Button variant="outline" size="icon" onClick={() => handleCopy(profile.email, 'Email')}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="department" className="flex items-center gap-2">
                            <Building className="h-4 w-4" /> Department
                        </Label>
                        <Input id="department" value={profile.department || 'N/A'} readOnly className="bg-muted" />
                    </div>

                    {profile.role === 'student' && (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="register" className="flex items-center gap-2">
                                    <Briefcase className="h-4 w-4" /> Register Number
                                </Label>
                                <div className="flex gap-2">
                                    <Input id="register" value={profile.register_number || 'N/A'} readOnly className="bg-muted" />
                                    <Button variant="outline" size="icon" onClick={() => handleCopy(profile.register_number, 'Register Number')}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="specialization" className="flex items-center gap-2">
                                    <GraduationCap className="h-4 w-4" /> Specialization
                                </Label>
                                <Input id="specialization" value={profile.specialization || 'N/A'} readOnly className="bg-muted" />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="phone" className="flex items-center gap-2">
                                    <Phone className="h-4 w-4" /> Phone
                                </Label>
                                <Input id="phone" value={profile.phone || 'N/A'} readOnly className="bg-muted" />
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ProfileModal;
