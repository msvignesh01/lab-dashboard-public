"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Box, ChevronDown, LogOut, Menu, ScanLine } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { navigation, roleDetails, type Role } from "@/lib/portal-data"
import { PortalProvider, usePortal } from "@/components/portal/portal-context"

function PortalNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const { role } = usePortal()
  const items = navigation.filter((item) => item.roles.includes(role))

  return (
    <nav className="flex flex-col gap-1" aria-label={mobile ? "Mobile portal navigation" : "Portal navigation"}>
      {items.map((item) => {
        const active = item.href === "/portal" ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Button key={item.href} asChild variant={active ? "secondary" : "ghost"} className="justify-start">
            <Link href={item.href}>
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}

function RoleSwitcher() {
  const { role, setRole } = usePortal()
  const detail = roleDetails[role]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto justify-start px-2 py-2">
          <Avatar>
            <AvatarFallback>{detail.name.split(" ").map((part) => part[0]).slice(-2).join("")}</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-sm font-medium">{detail.name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">{role} / {detail.code}</span>
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Preview access level</DropdownMenuLabel>
        <DropdownMenuGroup>
          {(["student", "faculty", "admin"] as Role[]).map((option) => (
            <DropdownMenuItem key={option} onSelect={() => setRole(option)}>
              <span className="flex-1 capitalize">{option}</span>
              {role === option && <Badge variant="secondary">Active</Badge>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild><Link href="/portal/id-card"><ScanLine />View digital ID</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/"><LogOut />Exit portal</Link></DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PortalFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role } = usePortal()
  const mobileItems = navigation.filter((item) => item.roles.includes(role)).slice(0, 4)
  const title = navigation.find((item) => item.href === "/portal" ? pathname === item.href : pathname.startsWith(item.href))?.label ?? "Lab portal"

  return (
    <div className="min-h-dvh bg-background">
      <a href="#portal-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to portal content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar p-4 md:flex">
        <Link href="/" className="flex items-center gap-3 px-2 py-3" aria-label="Fabrication Lab home">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Box /></span>
          <span><span className="block font-semibold">Fabrication Lab</span><span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">System / 01</span></span>
        </Link>
        <div className="my-5 h-px bg-border" />
        <PortalNav />
        <div className="mt-auto rounded-lg border bg-background p-4">
          <div className="mb-3 flex items-center justify-between"><span className="font-mono text-xs uppercase text-muted-foreground">Lab status</span><span className="size-2 rounded-full bg-status-active" /></div>
          <p className="text-sm font-medium">Open until 20:00</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">3 machines available · safety desk staffed</p>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-background/90 px-4 backdrop-blur-xl md:px-8">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="mr-2 md:hidden" aria-label="Open navigation"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader><SheetTitle>Fabrication Lab</SheetTitle><SheetDescription>Role-aware lab operations</SheetDescription></SheetHeader>
              <div className="px-4"><PortalNav mobile /></div>
            </SheetContent>
          </Sheet>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Portal / {title}</p>
            <h1 className="text-sm font-medium">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-status-warning" /></Button>
            <ThemeToggle />
            <RoleSwitcher />
          </div>
        </header>
        <main id="portal-content" className="mx-auto max-w-7xl p-4 pb-24 md:p-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 p-2 backdrop-blur-xl md:hidden" aria-label="Primary mobile navigation">
        {mobileItems.map((item) => {
          const Icon = item.icon
          const active = item.href === "/portal" ? pathname === item.href : pathname.startsWith(item.href)
          return <Link key={item.href} href={item.href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-md font-mono text-[10px] uppercase", active ? "bg-secondary text-foreground" : "text-muted-foreground")}><Icon className="size-4" />{item.label}</Link>
        })}
      </nav>
    </div>
  )
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  return <PortalProvider><PortalFrame>{children}</PortalFrame></PortalProvider>
}
