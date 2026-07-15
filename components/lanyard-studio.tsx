"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowLeft, Box } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

const LanyardWithControls = dynamic(() => import("@/components/lanyard-with-controls"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center font-mono text-xs uppercase text-muted-foreground">
      Loading 3D studio
    </div>
  ),
})

export function LanyardStudio() {
  return (
    <div className="flex min-h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-xl sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Box />
          </span>
          <span>
            <span className="block text-sm font-semibold">Fabrication Lab</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Lanyard studio
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft data-icon="inline-start" />
              Back to lab
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl px-4 pt-10 text-center sm:px-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio / interactive</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Design your lab lanyard.</h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            Personalize the 3D credential, drag it to swing it, and export a PNG. This is a preview surface — real lab
            access is issued in the portal.
          </p>
        </div>
        <div className="relative mt-2 min-h-[560px] flex-1">
          <LanyardWithControls defaultName="MAKE / 01" containerClassName="absolute inset-0 select-none" />
        </div>
      </main>
    </div>
  )
}
