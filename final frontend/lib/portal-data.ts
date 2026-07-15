import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  CircleGauge,
  CreditCard,
  GraduationCap,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react"

export type Role = "student" | "faculty" | "admin"
export type MachineStatus = "available" | "in-use" | "maintenance"
export type BookingStatus = "approved" | "pending" | "rejected"

export interface Machine {
  id: string
  name: string
  model: string
  process: string
  location: string
  status: MachineStatus
  utilization: number
  material: string
}

export interface Booking {
  id: string
  machine: string
  owner: string
  date: string
  time: string
  purpose: string
  status: BookingStatus
}

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
}

export const machines: Machine[] = [
  { id: "m-01", name: "Form 4L", model: "SLA / LFS", process: "Resin", location: "Bay 01", status: "available", utilization: 42, material: "Tough 2000" },
  { id: "m-02", name: "X1 Carbon", model: "CoreXY", process: "FDM", location: "Bay 04", status: "in-use", utilization: 78, material: "PA-CF" },
  { id: "m-03", name: "Fuse 1+ 30W", model: "SLS", process: "Powder", location: "Bay 07", status: "maintenance", utilization: 64, material: "Nylon 12" },
  { id: "m-04", name: "Metal X", model: "Bound metal", process: "Metal FFF", location: "Bay 09", status: "available", utilization: 29, material: "17-4 PH" },
]

export const bookings: Booking[] = [
  { id: "bk-1048", machine: "Form 4L", owner: "Avery Morgan", date: "Jul 16", time: "09:30–11:30", purpose: "Capstone enclosure iteration", status: "approved" },
  { id: "bk-1049", machine: "X1 Carbon", owner: "Nora Chen", date: "Jul 16", time: "13:00–15:00", purpose: "Robotics end-effector", status: "pending" },
  { id: "bk-1050", machine: "Metal X", owner: "Jon Bell", date: "Jul 17", time: "10:00–12:30", purpose: "Thermal fixture validation", status: "pending" },
  { id: "bk-1051", machine: "Fuse 1+ 30W", owner: "Mina Patel", date: "Jul 18", time: "14:00–16:00", purpose: "Topology study specimens", status: "rejected" },
]

export const navigation: NavItem[] = [
  { label: "Overview", href: "/portal", icon: LayoutDashboard, roles: ["student", "faculty", "admin"] },
  { label: "Machines", href: "/portal/machines", icon: CircleGauge, roles: ["student", "faculty", "admin"] },
  { label: "Bookings", href: "/portal/bookings", icon: CalendarDays, roles: ["student", "faculty", "admin"] },
  { label: "Operations", href: "/portal/operations", icon: Wrench, roles: ["faculty", "admin"] },
  { label: "Training", href: "/portal/training", icon: GraduationCap, roles: ["faculty", "admin"] },
  { label: "Users", href: "/portal/users", icon: Users, roles: ["admin"] },
  { label: "Audit log", href: "/portal/audit", icon: History, roles: ["admin"] },
  { label: "Lab settings", href: "/portal/settings", icon: Settings, roles: ["admin"] },
  { label: "Digital ID", href: "/portal/id-card", icon: CreditCard, roles: ["student", "faculty", "admin"] },
]

export const roleDetails = {
  student: { name: "Avery Morgan", code: "STU-20418", department: "Industrial Design", status: "Access active", icon: GraduationCap },
  faculty: { name: "Dr. Nora Chen", code: "FAC-0382", department: "Mechanical Engineering", status: "Operator active", icon: ShieldCheck },
  admin: { name: "Sam Rivera", code: "ADM-0014", department: "Lab Operations", status: "Administrator", icon: Settings },
} satisfies Record<Role, { name: string; code: string; department: string; status: string; icon: LucideIcon }>
