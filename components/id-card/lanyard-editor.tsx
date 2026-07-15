"use client"

import { Download, Printer, Save } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  downloadCredentialArtwork,
  MAX_CARD_NAME_LENGTH,
  normalizeCardName,
  type CardVariant,
  type CredentialArtwork,
} from "@/components/id-card/credential-texture"
import { LanyardDisplay } from "@/components/id-card/lanyard-display"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Profile } from "@/lib/types"

interface LanyardEditorProps {
  profile: Profile
}

export function LanyardEditor({ profile }: LanyardEditorProps) {
  const initialName = normalizeCardName(profile.full_name)
  const [draftName, setDraftName] = useState(initialName)
  const [draftVariant, setDraftVariant] = useState<CardVariant>("dark")
  const [appliedName, setAppliedName] = useState(initialName)
  const [appliedVariant, setAppliedVariant] = useState<CardVariant>("dark")
  const [saving, setSaving] = useState(false)

  const artwork = useMemo<CredentialArtwork>(() => ({
    displayName: appliedName,
    department: profile.department,
    role: profile.role,
    status: profile.status,
    variant: appliedVariant,
  }), [appliedName, appliedVariant, profile.department, profile.role, profile.status])

  const hasUnappliedChanges = draftName !== appliedName || draftVariant !== appliedVariant

  const applyEdits = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = normalizeCardName(draftName, profile.full_name)
    setDraftName(normalizedName)
    setAppliedName(normalizedName)
    setAppliedVariant(draftVariant)
  }

  const saveArtwork = async () => {
    setSaving(true)
    try {
      await downloadCredentialArtwork(artwork, appliedName)
      toast.success("Card saved as a PNG.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Card could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="credential-print-surface relative min-h-[680px] overflow-hidden rounded-2xl border bg-secondary shadow-xl shadow-foreground/5">
      <LanyardDisplay
        containerClassName="h-[680px] w-full"
        department={profile.department}
        interactive
        name={appliedName}
        position={[0, 0, 19]}
        role={profile.role}
        status={profile.status}
        variant={appliedVariant}
      />

      <form
        className="absolute inset-x-4 bottom-4 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur-xl print:hidden sm:inset-x-auto sm:right-5 sm:w-[min(34rem,calc(100%-2.5rem))]"
        onSubmit={applyEdits}
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="credential-display-name">Card name</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {Array.from(draftName).length}/{MAX_CARD_NAME_LENGTH}
              </span>
            </div>
            <Input
              id="credential-display-name"
              autoComplete="name"
              maxLength={MAX_CARD_NAME_LENGTH}
              onChange={(event) => setDraftName(event.target.value)}
              value={draftName}
            />
          </div>
          <Button disabled={!hasUnappliedChanges} type="submit">
            <Save />Apply edits
          </Button>
        </div>

        <div className="mt-4 flex flex-col justify-between gap-4 border-t pt-4 sm:flex-row sm:items-center">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted-foreground">Card theme</legend>
            <div className="flex gap-2">
              <ThemeChoice checked={draftVariant === "dark"} label="Dark" onSelect={() => setDraftVariant("dark")} swatch="bg-neutral-950" />
              <ThemeChoice checked={draftVariant === "light"} label="Light" onSelect={() => setDraftVariant("light")} swatch="bg-neutral-100" />
            </div>
          </fieldset>
          <CredentialActions
            onPrint={() => window.print()}
            onSave={saveArtwork}
            saving={saving}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Card edits affect this presentation only. Your verified profile, role, and access remain server-controlled.
        </p>
      </form>
    </div>
  )
}

interface CredentialActionsProps {
  onPrint: () => void
  onSave: () => void
  saving?: boolean
}

export function CredentialActions({ onPrint, onSave, saving = false }: CredentialActionsProps) {
  return (
    <div className="flex gap-2">
      <Button disabled={saving} onClick={onSave} type="button" variant="outline">
        <Download />{saving ? "Saving…" : "Save PNG"}
      </Button>
      <Button onClick={onPrint} type="button" variant="outline">
        <Printer />Print
      </Button>
    </div>
  )
}

interface ThemeChoiceProps {
  checked: boolean
  label: string
  onSelect: () => void
  swatch: string
}

function ThemeChoice({ checked, label, onSelect, swatch }: ThemeChoiceProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <input
        checked={checked}
        className="sr-only"
        name="credential-theme"
        onChange={onSelect}
        type="radio"
      />
      <span aria-hidden="true" className={`size-4 rounded-full border ${swatch} ${checked ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`} />
      {label}
    </label>
  )
}
