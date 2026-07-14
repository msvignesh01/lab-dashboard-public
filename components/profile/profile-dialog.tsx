"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DEPARTMENTS } from "@/lib/constants"
import type { Profile } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"

interface ProfileForm {
  full_name: string
  department: string
  phone: string
  register_number: string
  specialization: string
  year_of_passout: string
}

function profileForm(profile: Profile): ProfileForm {
  return {
    full_name: profile.full_name ?? "",
    department: profile.department ?? "",
    phone: profile.phone ?? "",
    register_number: profile.register_number ?? "",
    specialization: profile.specialization ?? "",
    year_of_passout: profile.year_of_passout ?? "",
  }
}

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { profile, updateOwnProfile, refreshProfile } = useAuth()
  const [form, setForm] = useState<ProfileForm>(() => profile ? profileForm(profile) : {
    full_name: "",
    department: "",
    phone: "",
    register_number: "",
    specialization: "",
    year_of_passout: "",
  })
  const [saving, setSaving] = useState(false)

  if (!profile) return null

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !saving) setForm(profileForm(profile))
    onOpenChange(nextOpen)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (form.full_name.trim().length < 2) {
      toast.error("Enter your full name.")
      return
    }
    setSaving(true)
    const result = await updateOwnProfile(form)
    if (result.error) {
      toast.error(result.error.message)
      setSaving(false)
      return
    }
    await refreshProfile()
    setSaving(false)
    toast.success("Profile updated.")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Identity role and access status are controlled by administrators and cannot be edited here.</DialogDescription>
        </DialogHeader>
        <form id="profile-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <ProfileField label="Full name" id="profile-name" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} maxLength={100} required />
          <div className="grid gap-2">
            <Label htmlFor="profile-department">Department</Label>
            <select id="profile-department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="flex h-10 rounded-md border border-input bg-background px-3 text-sm" required>
              {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
              {!DEPARTMENTS.includes(form.department as (typeof DEPARTMENTS)[number]) && form.department && <option value={form.department}>{form.department}</option>}
            </select>
          </div>
          <ProfileField label="Phone" id="profile-phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} maxLength={40} />
          <ProfileField label="Register number" id="profile-register" value={form.register_number} onChange={(value) => setForm({ ...form, register_number: value })} maxLength={40} />
          <ProfileField label="Course / specialization" id="profile-specialization" value={form.specialization} onChange={(value) => setForm({ ...form, specialization: value })} maxLength={100} />
          <ProfileField label="Year of passout" id="profile-year" value={form.year_of_passout} onChange={(value) => setForm({ ...form, year_of_passout: value })} maxLength={10} />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="profile-form" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfileField({ label, id, value, onChange, maxLength, required = false }: { label: string; id: string; value: string; onChange: (value: string) => void; maxLength: number; required?: boolean }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} required={required} /></div>
}
