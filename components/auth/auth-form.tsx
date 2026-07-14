"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Box, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"
import { DEPARTMENTS, EMAIL_DOMAINS, RATE_LIMIT } from "@/lib/constants"
import { validateEmail, validatePassword, validatePhoneNumber } from "@/lib/security"
import type { SignupMetadata } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"

type SignupRole = "student" | "faculty"

interface AuthFormState {
  fullName: string
  email: string
  password: string
  department: string
  phone: string
  registerNumber: string
  specialization: string
  yearOfPassout: string
}

const initialState: AuthFormState = {
  fullName: "",
  email: "",
  password: "",
  department: "",
  phone: "",
  registerNumber: "",
  specialization: "",
  yearOfPassout: "",
}

function passoutYears(): string[] {
  const now = new Date()
  const start = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear()
  return Array.from({ length: 5 }, (_, index) => String(start + index))
}

function readLockout(): { locked: boolean; remaining: number } {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT.STORAGE_KEY)
    if (!raw) return { locked: false, remaining: 0 }
    const state = JSON.parse(raw) as { lockedUntil?: number }
    if (!state.lockedUntil || state.lockedUntil <= Date.now()) {
      sessionStorage.removeItem(RATE_LIMIT.STORAGE_KEY)
      return { locked: false, remaining: 0 }
    }
    return { locked: true, remaining: Math.ceil((state.lockedUntil - Date.now()) / 1000) }
  } catch {
    return { locked: false, remaining: 0 }
  }
}

function recordFailedAttempt(): void {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT.STORAGE_KEY)
    const state = raw ? JSON.parse(raw) as { count?: number; lockedUntil?: number } : {}
    const count = (state.count ?? 0) + 1
    sessionStorage.setItem(RATE_LIMIT.STORAGE_KEY, JSON.stringify({
      count,
      lockedUntil: count >= RATE_LIMIT.MAX_LOGIN_ATTEMPTS
        ? Date.now() + RATE_LIMIT.LOCKOUT_DURATION_MS
        : state.lockedUntil ?? null,
    }))
  } catch {
    // Firebase Auth remains the authoritative abuse-control layer.
  }
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter()
  const { user, loading: authLoading, signIn, signUp, sendPasswordReset } = useAuth()
  const signup = mode === "signup"
  const [role, setRole] = useState<SignupRole>("student")
  const [form, setForm] = useState<AuthFormState>(initialState)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [lockout, setLockout] = useState({ locked: false, remaining: 0 })
  const years = useMemo(() => passoutYears(), [])

  useEffect(() => {
    if (!signup) {
      const update = () => setLockout(readLockout())
      update()
      const timer = window.setInterval(update, 1000)
      return () => window.clearInterval(timer)
    }
  }, [signup])

  useEffect(() => {
    if (!signup && !authLoading && user) router.replace("/portal")
  }, [authLoading, router, signup, user])

  const update = (field: keyof AuthFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError("")
  }

  const validateSignup = (): string | null => {
    const email = form.email.toLowerCase().trim()
    if (form.fullName.trim().length < 2) return "Enter your full name."
    if (!DEPARTMENTS.includes(form.department as (typeof DEPARTMENTS)[number])) return "Select a valid department."
    if (role === "student" && !email.endsWith(EMAIL_DOMAINS.STUDENT)) {
      return `Students must use ${EMAIL_DOMAINS.STUDENT}.`
    }
    if (role === "faculty" && (!email.endsWith(EMAIL_DOMAINS.FACULTY) || email.endsWith(EMAIL_DOMAINS.STUDENT))) {
      return `Faculty must use ${EMAIL_DOMAINS.FACULTY}.`
    }
    if (role === "student") {
      if (!validatePhoneNumber(form.phone)) return "Enter a valid phone number."
      if (form.registerNumber.trim().length < 6) return "Enter a valid register number."
      if (form.specialization.trim().length < 2) return "Enter your course or specialization."
      if (!years.includes(form.yearOfPassout)) return "Select a valid year of passout."
    }
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    if (lockout.locked) {
      setFormError(`Too many unsuccessful attempts. Try again in ${lockout.remaining} seconds.`)
      return
    }

    const email = form.email.toLowerCase().trim()
    if (!validateEmail(email)) {
      setFormError("Enter a valid institutional email address.")
      return
    }
    if (signup && !validatePassword(form.password)) {
      setFormError("Use 8–128 characters with uppercase, lowercase, a number, and a special character.")
      return
    }
    if (signup) {
      const validationError = validateSignup()
      if (validationError) {
        setFormError(validationError)
        return
      }
    }

    setSubmitting(true)
    setFormError("")
    try {
      if (signup) {
        const metadata: SignupMetadata = {
          full_name: form.fullName.trim(),
          role,
          department: form.department,
          ...(role === "student" ? {
            phone: form.phone.trim(),
            register_number: form.registerNumber.trim(),
            specialization: form.specialization.trim(),
            year_of_passout: form.yearOfPassout,
          } : {}),
        }
        const result = await signUp(email, form.password, metadata)
        if (result.error) {
          setFormError(result.error.message)
          return
        }
        toast.success(result.data.recoveredRegistration
          ? "Your existing registration was recovered safely."
          : role === "faculty"
            ? "Request created. Verify your email, then wait for administrator approval."
            : "Account created. Verify your email before signing in.")
        for (const warning of result.data.warnings) {
          toast.warning(warning.message, { duration: 8_000 })
        }
        router.replace("/login")
      } else {
        const result = await signIn(email, form.password)
        if (result.error) {
          recordFailedAttempt()
          setLockout(readLockout())
          setFormError(result.error.message)
          return
        }
        sessionStorage.removeItem(RATE_LIMIT.STORAGE_KEY)
        toast.success("Signed in securely.")
        router.replace("/portal")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handlePasswordReset = async () => {
    const email = form.email.toLowerCase().trim()
    if (!validateEmail(email)) {
      setFormError("Enter your institutional email first.")
      return
    }
    setSubmitting(true)
    const { error } = await sendPasswordReset(email)
    setSubmitting(false)
    if (error) setFormError(error.message)
    else toast.success("If the account exists, a password-reset email has been sent.")
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r bg-primary p-10 text-primary-foreground lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-3 font-medium">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary-foreground text-primary"><Box /></span>
          Fabrication Lab
        </Link>
        <div className="my-auto max-w-lg">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary-foreground/60">Institutional identity gateway</p>
          <h1 className="mt-5 text-balance text-6xl font-semibold tracking-tight">Build access starts here.</h1>
          <p className="mt-6 text-lg leading-relaxed text-primary-foreground/70">One verified account for equipment scheduling, training, review, and lab operations.</p>
        </div>
        <p className="font-mono text-xs text-primary-foreground/50">AUTHORITY / FIREBASE ID + SERVER PROFILE</p>
      </section>

      <section className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between border-b px-6">
          <Link href="/" className="font-mono text-xs uppercase tracking-wider">Back to lab</Link>
          <ThemeToggle />
        </header>
        <div className="flex flex-1 items-center justify-center p-6 py-10">
          <Card className="w-full max-w-md border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-3xl">{signup ? "Request lab access" : "Enter the lab portal"}</CardTitle>
              <CardDescription>{signup ? "Create an institutional profile. Faculty accounts require approval." : "Use your verified institutional credentials."}</CardDescription>
            </CardHeader>
            <CardContent>
              <form id="auth-form" className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                {signup && (
                  <>
                    <Tabs value={role} onValueChange={(value) => setRole(value as SignupRole)}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="student">Student</TabsTrigger>
                        <TabsTrigger value="faculty">Faculty</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Field label="Full name" htmlFor="name" icon={<UserRound />}>
                      <Input id="name" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} className="pl-9" autoComplete="name" maxLength={100} required />
                    </Field>
                  </>
                )}

                <Field label="Institutional email" htmlFor="email" icon={<Mail />}>
                  <Input id="email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="pl-9" autoComplete="email" placeholder={signup && role === "student" ? `name${EMAIL_DOMAINS.STUDENT}` : `name${EMAIL_DOMAINS.FACULTY}`} maxLength={254} required />
                </Field>

                {signup && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="department">Department</Label>
                    <select id="department" value={form.department} onChange={(event) => update("department", event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                      <option value="">Select department</option>
                      {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                  </div>
                )}

                {signup && role === "student" && (
                  <>
                    <SimpleField id="phone" label="Phone number" value={form.phone} onChange={(value) => update("phone", value.replace(/[^0-9+()\s-]/g, ""))} autoComplete="tel" maxLength={20} />
                    <SimpleField id="register-number" label="Register number" value={form.registerNumber} onChange={(value) => update("registerNumber", value.replace(/[^a-zA-Z0-9]/g, ""))} maxLength={40} />
                    <SimpleField id="specialization" label="Course or specialization" value={form.specialization} onChange={(value) => update("specialization", value)} maxLength={100} />
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="passout-year">Year of passout</Label>
                      <select id="passout-year" value={form.yearOfPassout} onChange={(event) => update("yearOfPassout", event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                        <option value="">Select year</option>
                        {years.map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!signup && <button type="button" onClick={handlePasswordReset} disabled={submitting || !form.email} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">Forgot password?</button>}
                  </div>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="password" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => update("password", event.target.value)} className="pl-9 pr-10" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} maxLength={128} required />
                    <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {signup && <p className="text-xs text-muted-foreground">8–128 characters with uppercase, lowercase, number, and special character.</p>}
                </div>

                {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
              </form>
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button type="submit" form="auth-form" className="w-full" disabled={submitting || authLoading || lockout.locked}>
                {lockout.locked ? `Locked (${lockout.remaining}s)` : submitting ? "Please wait…" : signup ? "Create access request" : "Sign in"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {signup ? "Already registered?" : "Need an account?"}{" "}
                <Link href={signup ? "/login" : "/signup"} className="font-medium text-foreground underline underline-offset-4">{signup ? "Sign in" : "Request access"}</Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  )
}

function Field({ label, htmlFor, icon, children }: { label: string; htmlFor: string; icon: React.ReactElement; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 flex size-4 -translate-y-1/2 text-muted-foreground [&>svg]:size-4">{icon}</span>
        {children}
      </div>
    </div>
  )
}

function SimpleField({ id, label, value, onChange, autoComplete, maxLength }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete?: string; maxLength: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} maxLength={maxLength} required />
    </div>
  )
}
