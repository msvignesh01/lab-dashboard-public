"use client"

import { useState } from "react"
import { CalendarDays, MoreHorizontal, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { bookings as initialBookings } from "@/lib/portal-data"

export function BookingLedger() {
  const [bookings, setBookings] = useState(initialBookings)
  const cancel = (id: string) => setBookings((current) => current.map((item) => item.id === id ? { ...item, status: "rejected" as const } : item))
  return <div className="flex flex-col gap-8"><div className="border-b pb-8"><p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Booking ledger / synchronized</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Equipment time</h2><p className="mt-2 max-w-2xl text-muted-foreground">Track requests, faculty decisions, and your upcoming lab sessions.</p></div><Tabs defaultValue="all"><div className="flex flex-col justify-between gap-3 sm:flex-row"><TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="pending">Pending</TabsTrigger><TabsTrigger value="approved">Approved</TabsTrigger></TabsList><div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search ledger" className="pl-9" /></div></div>{["all", "pending", "approved"].map((tab) => <TabsContent key={tab} value={tab}><Card><CardHeader><CardTitle>{tab === "all" ? "All activity" : `${tab[0].toUpperCase()}${tab.slice(1)} requests`}</CardTitle><CardDescription>Booking state changes are recorded in the lab audit trail.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{bookings.filter((item) => tab === "all" || item.status === tab).map((booking) => <div key={booking.id} className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="flex size-11 items-center justify-center rounded-md bg-secondary"><CalendarDays /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{booking.machine}</p><Badge variant={booking.status === "approved" ? "default" : booking.status === "pending" ? "secondary" : "destructive"}>{booking.status}</Badge></div><p className="mt-1 font-mono text-xs text-muted-foreground">{booking.id} / {booking.date} / {booking.time}</p><p className="mt-2 text-sm text-muted-foreground">{booking.purpose}</p></div>{booking.status !== "rejected" && <Button variant="ghost" size="sm" onClick={() => cancel(booking.id)}>Cancel</Button>}<Button variant="ghost" size="icon" aria-label={`More actions for ${booking.id}`}><MoreHorizontal /></Button></div>)}</CardContent></Card></TabsContent>)}</Tabs></div>
}
