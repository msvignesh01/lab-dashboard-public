import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return <main className="flex min-h-dvh items-center justify-center p-6"><div className="max-w-md text-center"><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404 / not found</p><h1 className="mt-4 text-4xl font-semibold">This page does not exist.</h1><Button asChild className="mt-6"><Link href="/">Return home</Link></Button></div></main>
}
