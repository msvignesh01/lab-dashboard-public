"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ArrowRight,
  Box,
  CalendarCheck,
  CheckCircle2,
  CircleGauge,
  GraduationCap,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react"
import { LanyardDisplay } from "@/components/id-card/lanyard-display"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const Dither = dynamic(() => import("@/components/Dither"), { ssr: false })

const capabilities = [
  { index: "01", title: "Polymer systems", description: "Manage qualified FDM, SLA, and SLS workflows through one equipment registry.", icon: Box },
  { index: "02", title: "Controlled workflows", description: "Training, maintenance, and booking rules stay attached to each machine record.", icon: Sparkles },
  { index: "03", title: "Safety by design", description: "Eligibility, role, account state, and conflicts are checked by trusted server policies.", icon: ShieldCheck },
]

const steps = [
  { title: "Create your identity", detail: "Register with the correct institutional account and profile.", icon: CheckCircle2 },
  { title: "Verify and qualify", detail: "Verify email; faculty requests require administrator approval.", icon: GraduationCap },
  { title: "Check equipment", detail: "See the current registry and server-calculated availability.", icon: CalendarCheck },
  { title: "Request and review", detail: "Create auditable bookings within lab policy.", icon: Wrench },
]

export function MarketingSite() {
  return (
    <div className="overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6" aria-label="Main navigation">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Box />
            </span>
            <span>
              <span className="block text-sm font-semibold">Fabrication Lab</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Additive systems
              </span>
            </span>
          </Link>
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <Button asChild variant="ghost">
              <Link href="#capabilities">Capabilities</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="#access">Access</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/portal/machines">Machines</Link>
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-4">
            <ThemeToggle />
            <Button asChild>
              <Link href="/login">
                Enter portal
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative min-h-dvh border-b pt-16">
          <div className="absolute inset-0 opacity-55">
            <Dither
              waveColor={[0.42, 0.42, 0.42]}
              disableAnimation={false}
              enableMouseInteraction
              mouseRadius={0.25}
              colorNum={4}
              pixelSize={2}
              waveAmplitude={0.22}
              waveFrequency={2.4}
              waveSpeed={0.03}
            />
          </div>
          <div className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative z-10 max-w-3xl">
              <Badge variant="secondary" className="mb-7 font-mono uppercase tracking-widest">
                Verified access · server-enforced
              </Badge>
              <h1 className="text-balance text-5xl font-semibold leading-[0.94] tracking-[-0.055em] min-[375px]:text-6xl sm:text-7xl lg:text-8xl">
                Ideas become objects here.
              </h1>
              <p className="mt-8 max-w-xl text-pretty text-lg font-medium leading-relaxed text-foreground/85 [text-shadow:0_1px_12px_var(--background)]">
                A centralized additive manufacturing portal for identity, equipment qualification, booking, review,
                maintenance, and accountable lab operations.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/signup">
                    Request lab access
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in to view equipment</Link>
                </Button>
              </div>
              <div className="mt-12 flex flex-wrap gap-6 border-t pt-6 font-mono text-xs uppercase text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-status-active" />
                  Systems online
                </span>
                <span className="flex items-center gap-2">
                  <MapPin className="size-3.5" />
                  Engineering Hall / L1
                </span>
                <span className="flex items-center gap-2">
                  <CircleGauge className="size-3.5" />
                  Availability in portal
                </span>
              </div>
            </div>
            <div className="relative hidden h-[650px] lg:block">
              <LanyardDisplay
                name="MAKE / 01"
                department="Fabrication Lab"
                role="Member"
                interactive={false}
                position={[0, 0, 20]}
                containerClassName="pointer-events-none absolute inset-0 select-none"
              />
            </div>
          </div>
        </section>

        <section id="capabilities" className="bg-background py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-8 border-b pb-12 lg:grid-cols-2">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Capabilities / 01–03</p>
              <div>
                <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
                  One portal. Clear operational authority.
                </h2>
                <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
                  The interface keeps complex lab workflows understandable while the backend remains authoritative for
                  every sensitive operation.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-3">
              {capabilities.map((item) => {
                const Icon = item.icon
                return (
                  <article
                    key={item.index}
                    className="border-b p-6 md:border-b-0 md:border-r md:last:border-r-0 md:p-8"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{item.index}</span>
                      <Icon className="size-5" />
                    </div>
                    <h3 className="mt-16 text-2xl font-semibold">{item.title}</h3>
                    <p className="mt-3 leading-relaxed text-muted-foreground">{item.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="access" className="border-y bg-secondary py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Access sequence / 04 steps
                </p>
                <h2 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
                  From new member to machine-ready.
                </h2>
              </div>
              <div className="flex flex-col">
                {steps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div
                      key={step.title}
                      className="grid grid-cols-[auto_1fr_auto] items-start gap-4 border-t py-6"
                    >
                      <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                      <div>
                        <h3 className="font-medium">{step.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
                      </div>
                      <Icon className="size-5" />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Card className="overflow-hidden bg-primary text-primary-foreground">
              <CardHeader className="p-8 sm:p-12">
                <CardDescription className="font-mono uppercase tracking-[0.2em] text-primary-foreground/60">
                  Trust model / explicit
                </CardDescription>
                <CardTitle className="max-w-4xl text-balance text-4xl sm:text-6xl">
                  The interface presents identity. The server grants authority.
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-start justify-between gap-6 border-t border-primary-foreground/20 p-8 sm:flex-row sm:items-center sm:p-12">
                <p className="max-w-xl leading-relaxed text-primary-foreground/70">
                  Roles, account status, machine training, conflicts, and every administrative action are re-checked
                  against trusted records.
                </p>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/login">
                    Enter secure portal
                    <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-medium">Fabrication Lab</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">ADDITIVE MANUFACTURING OPERATIONS</p>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground">
              Portal
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Request access
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
