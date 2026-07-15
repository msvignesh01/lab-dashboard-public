"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error(error)
  }, [error])

  return <main className="flex min-h-dvh items-center justify-center p-6"><div className="max-w-md text-center"><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Interface error</p><h1 className="mt-4 text-4xl font-semibold">The page could not be displayed.</h1><p className="mt-3 text-muted-foreground">No operation was assumed to have succeeded. Retry, then contact support if the problem continues.</p><Button className="mt-6" onClick={reset}>Retry</Button></div></main>
}
