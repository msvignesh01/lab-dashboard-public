"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Bell, Box, ChevronDown, LogOut, Menu, ScanLine, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/theme-toggle"
import { Reveal } from "@/components/motion/reveal"
import { ProfileDialog } from "@/components/profile/profile-dialog"
import { LoadingGate, PendingApprovalGate, ProfileErrorGate, SuspendedGate, VerifyEmailGate } from "@/components/auth/account-gates"
import { cn } from "@/lib/utils"
import { canAccessPath, navigation } from "@/lib/navigation"
import { formatLabDateTime } from "@/lib/lab-time"
import type { PortalNotification, Profile, Role } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { notificationService } from "@/services/portal-service"

function PortalNav({ role, mobile = false }: { role: Role; mobile?: boolean }) {
  const pathname = usePathname() ?? "/portal"
  return (
    <nav className="flex flex-col gap-1" aria-label={mobile ? "Mobile portal navigation" : "Portal navigation"}>
      {navigation.filter((item) => item.roles.includes(role)).map((item) => {
        const active = item.href === "/portal" ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = item.icon
        return <Button key={item.href} asChild variant={active ? "secondary" : "ghost"} className="justify-start"><Link href={item.href}><Icon />{item.label}</Link></Button>
      })}
    </nav>
  )
}

function initials(profile: Profile): string {
  return profile.full_name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(-2).join("").toUpperCase() || "ID"
}

function NotificationMenu() {
  const [notifications, setNotifications] = useState<PortalNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    const result = await notificationService.getNotifications()
    if (result.error) {
      if (!quiet) toast.error(result.error.message)
    } else {
      setNotifications(result.data)
    }
    if (!quiet) setLoading(false)
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void load(), 0)
    const pollTimer = window.setInterval(() => void load(true), 60_000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(pollTimer)
    }
  }, [load])

  const unread = notifications.filter((item) => !item.read_at)
  const markAllRead = async () => {
    if (unread.length === 0) return
    setMarking(true)
    const result = await notificationService.markRead(unread.map((item) => item.id))
    if (result.error) toast.error(result.error.message)
    else setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? result.data.read_at })))
    setMarking(false)
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void load(true) }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${unread.length} unread notifications`} className="relative">
          <Bell />
          {unread.length > 0 && <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[9px] text-destructive-foreground">{Math.min(unread.length, 9)}{unread.length > 9 ? "+" : ""}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between px-2 py-1.5"><DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel><Button size="sm" variant="ghost" onClick={markAllRead} disabled={marking || unread.length === 0}>Mark all read</Button></div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {loading ? <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p> : notifications.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No notifications.</p> : notifications.slice(0, 12).map((item) => (
            <div key={item.id} className={cn("border-b p-3 last:border-0", !item.read_at && "bg-secondary/60")}>
              <div className="flex items-start gap-2"><span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.read_at ? "bg-muted" : "bg-status-warning")} /><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.message}</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">{formatLabDateTime(item.created_at)}</p></div></div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountMenu({ profile }: { profile: Profile }) {
  const router = useRouter()
  const { signOut } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

  const logout = async () => {
    const { error } = await signOut()
    if (error) toast.error(error.message)
    else router.replace("/login")
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-auto justify-start px-2 py-2">
            <Avatar><AvatarFallback>{initials(profile)}</AvatarFallback></Avatar>
            <span className="hidden min-w-0 text-left sm:block"><span className="block truncate text-sm font-medium">{profile.full_name}</span><span className="block truncate font-mono text-xs uppercase text-muted-foreground">{profile.role} / verified</span></span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel><span className="block truncate">{profile.email}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{profile.department}</span></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}><UserRound />Edit profile</DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/portal/id-card"><ScanLine />View digital ID</Link></DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}><LogOut />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog key={profile.updated_at} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}

function PortalFrame({ children, profile }: { children: ReactNode; profile: Profile }) {
  const pathname = usePathname() ?? "/portal"
  const items = useMemo(() => navigation.filter((item) => item.roles.includes(profile.role)), [profile.role])
  const mobileItems = items.filter((item) => item.href !== "/portal/id-card").slice(0, 4)
  const title = navigation.find((item) => item.href === "/portal" ? pathname === item.href : pathname.startsWith(item.href))?.label ?? "Lab portal"

  if (!canAccessPath(pathname, profile.role)) {
    return <div className="flex min-h-dvh items-center justify-center p-6"><div className="max-w-md text-center"><p className="font-mono text-xs uppercase text-muted-foreground">Access denied</p><h1 className="mt-3 text-3xl font-semibold">This area is not available for your role.</h1><Button asChild className="mt-6"><Link href="/portal">Return to overview</Link></Button></div></div>
  }

  return (
    <div className="min-h-dvh bg-background">
      <a href="#portal-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to portal content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar p-4 md:flex">
        <Link href="/" className="flex items-center gap-3 px-2 py-3" aria-label="Fabrication Lab home"><span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Box /></span><span><span className="block font-semibold">Fabrication Lab</span><span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">System / 01</span></span></Link>
        <div className="my-5 h-px bg-border" />
        <PortalNav role={profile.role} />
        <div className="mt-auto rounded-lg border bg-background p-4"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-xs uppercase text-muted-foreground">Account status</span><span className="size-2 rounded-full bg-status-active" /></div><p className="text-sm font-medium">Server verified</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Active {profile.role} access. Operational permissions are enforced by the API.</p></div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-background/90 px-4 backdrop-blur-xl md:px-8">
          <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="mr-2 md:hidden" aria-label="Open navigation"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-72"><SheetHeader><SheetTitle>Fabrication Lab</SheetTitle><SheetDescription>Role-aware operations portal</SheetDescription></SheetHeader><div className="px-4"><PortalNav role={profile.role} mobile /></div></SheetContent></Sheet>
          <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Portal / {title}</p><h1 className="text-sm font-medium">{title}</h1></div>
          <div className="ml-auto flex items-center gap-1"><NotificationMenu /><ThemeToggle /><AccountMenu profile={profile} /></div>
        </header>
        <main id="portal-content" className="mx-auto max-w-7xl p-4 pb-24 md:p-8">
          <Reveal key={pathname} as="div" preset="blur-slide">
            {children}
          </Reveal>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 p-2 backdrop-blur-xl md:hidden" aria-label="Primary mobile navigation">
        {mobileItems.map((item) => { const Icon = item.icon; const active = item.href === "/portal" ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-md font-mono text-[10px] uppercase", active ? "bg-secondary text-foreground" : "text-muted-foreground")}><Icon className="size-4" />{item.label}</Link> })}
      </nav>
    </div>
  )
}

export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, profile, loading, profileLoading, profileError, accessState } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, router, user])

  if (loading || profileLoading) return <LoadingGate />
  if (!user) return <LoadingGate message="Redirecting to sign in…" />
  if (accessState === "email_unverified") return <VerifyEmailGate />
  if (accessState === "pending_approval") return <PendingApprovalGate />
  if (accessState === "suspended" || accessState === "profile_inactive") return <SuspendedGate />
  if (accessState === "profile_error" || accessState === "profile_missing" || !profile) return <ProfileErrorGate message={profileError?.message} />
  return <PortalFrame profile={profile}>{children}</PortalFrame>
}
