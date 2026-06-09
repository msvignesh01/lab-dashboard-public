import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCircle, Mail, Phone, Building, Briefcase, GraduationCap, Copy, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { securityUtils } from '@/lib/security';
import { authService } from '@/services/authService';
import { DEPARTMENTS } from '@/lib/constants';

const buildForm = (profile) => ({
    full_name: profile?.full_name || '',
    department: profile?.department || '',
    phone: profile?.phone || '',
    register_number: profile?.register_number || '',
    specialization: profile?.specialization || '',
    year_of_passout: profile?.year_of_passout || '',
});

const ProfileModal = ({ isOpen, onClose }) => {
    const { profile, refreshProfile } = useAuth();
    const [avatarHash, setAvatarHash] = useState('default');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(buildForm(null));

    useEffect(() => {
        if (profile?.email) {
            securityUtils.hashForAvatar(profile.email).then(setAvatarHash);
        }
    }, [profile?.email]);

    const handleClose = () => {
        setIsEditing(false);
        onClose();
    };

    const startEditing = () => {
        setForm(buildForm(profile));
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setForm(buildForm(profile));
        setIsEditing(false);
    };

    const handleCopy = async (text, label) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied to clipboard`);
        } catch {
            toast.error(`Could not copy ${label.toLowerCase()}`);
        }
    };

    const isStudent = profile?.role === 'student';

    const handleSave = async () => {
        if (saving) return;

        if (form.full_name.trim().length < 2) {
            toast.error('Please enter a valid full name');
            return;
        }
        if (!DEPARTMENTS.includes(form.department)) {
            toast.error('Please select a valid department');
            return;
        }
        if (isStudent && !securityUtils.validatePhoneNumber(form.phone)) {
            toast.error('Please enter a valid phone number');
            return;
        }

        const updates = {
            full_name: form.full_name,
            department: form.department,
        };
        if (isStudent) {
            updates.phone = form.phone;
            updates.register_number = form.register_number;
            updates.specialization = form.specialization;
            updates.year_of_passout = form.year_of_passout;
        }

        setSaving(true);
        const { error } = await authService.updateProfile(updates);
        setSaving(false);
        if (error) {
            toast.error(error.message || 'Could not update profile');
            return;
        }
        await refreshProfile();
        toast.success('Profile updated');
        setIsEditing(false);
    };

    if (!profile) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
            <DialogContent className="sm:max-w-[425px] max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Profile Details</DialogTitle>
                    <DialogDescription>Your account information and university details.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-3 py-2">
                    <Avatar className="h-24 w-24 border-4 border-muted">
                        <AvatarImage src={`https://avatar.vercel.sh/${avatarHash}`} />
                        <AvatarFallback><UserCircle className="h-20 w-20 text-muted-foreground" /></AvatarFallback>
                    </Avatar>
                    <div className="text-center">
                        <h3 className="text-xl font-bold">{profile.full_name}</h3>
                        <p className="text-sm text-muted-foreground capitalize">{profile.role}</p>
                    </div>
                </div>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="profile-email" className="flex items-center gap-2">
                            <Mail className="h-4 w-4" /> Email
                        </Label>
                        <div className="flex gap-2">
                            <Input id="profile-email" value={profile.email} readOnly className="bg-muted" />
                            <Button variant="outline" size="icon" onClick={() => handleCopy(profile.email, 'Email')} aria-label="Copy email">
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="profile-fullname" className="flex items-center gap-2">
                            <UserCircle className="h-4 w-4" /> Full Name
                        </Label>
                        <Input
                            id="profile-fullname"
                            value={isEditing ? form.full_name : (profile.full_name || 'N/A')}
                            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                            readOnly={!isEditing}
                            maxLength={100}
                            className={isEditing ? '' : 'bg-muted'}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="profile-department" className="flex items-center gap-2">
                            <Building className="h-4 w-4" /> Department
                        </Label>
                        {isEditing ? (
                            <select
                                id="profile-department"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={form.department}
                                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                            >
                                <option value="">Select Department</option>
                                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        ) : (
                            <Input id="profile-department" value={profile.department || 'N/A'} readOnly className="bg-muted" />
                        )}
                    </div>

                    {isStudent && (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="profile-register" className="flex items-center gap-2">
                                    <Briefcase className="h-4 w-4" /> Register Number
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="profile-register"
                                        value={isEditing ? form.register_number : (profile.register_number || 'N/A')}
                                        onChange={(e) => setForm((f) => ({ ...f, register_number: e.target.value.replace(/[^a-zA-Z0-9]/g, '') }))}
                                        readOnly={!isEditing}
                                        maxLength={40}
                                        className={isEditing ? '' : 'bg-muted'}
                                    />
                                    {!isEditing && (
                                        <Button variant="outline" size="icon" onClick={() => handleCopy(profile.register_number, 'Register Number')} aria-label="Copy register number">
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="profile-specialization" className="flex items-center gap-2">
                                    <GraduationCap className="h-4 w-4" /> Specialization
                                </Label>
                                <Input
                                    id="profile-specialization"
                                    value={isEditing ? form.specialization : (profile.specialization || 'N/A')}
                                    onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
                                    readOnly={!isEditing}
                                    maxLength={100}
                                    className={isEditing ? '' : 'bg-muted'}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="profile-phone" className="flex items-center gap-2">
                                    <Phone className="h-4 w-4" /> Phone
                                </Label>
                                <Input
                                    id="profile-phone"
                                    type="tel"
                                    value={isEditing ? form.phone : (profile.phone || 'N/A')}
                                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9\s\-+()]/g, '') }))}
                                    readOnly={!isEditing}
                                    maxLength={20}
                                    className={isEditing ? '' : 'bg-muted'}
                                />
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {isEditing ? (
                        <>
                            <Button variant="outline" onClick={cancelEditing} disabled={saving} className="w-full sm:w-auto">
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                                {saving ? 'Saving...' : 'Save changes'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">Close</Button>
                            <Button onClick={startEditing} className="w-full sm:w-auto">
                                <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ProfileModal;
