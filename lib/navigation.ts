import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  CircleGauge,
  CreditCard,
  GraduationCap,
  History,
  LayoutDashboard,
  Settings,
  Users,
  Wrench,
} from "lucide-react"
import type { Role } from "@/lib/types"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: Role[]
}

export const navigation: NavItem[] = [
  { label: "Overview", href: "/portal", icon: LayoutDashboard, roles: ["student", "faculty", "admin"] },
  { label: "Machines", href: "/portal/machines", icon: CircleGauge, roles: ["student", "faculty", "admin"] },
  { label: "Bookings", href: "/portal/bookings", icon: CalendarDays, roles: ["student", "faculty", "admin"] },
  { label: "Operations", href: "/portal/operations", icon: Wrench, roles: ["faculty", "admin"] },
  { label: "Training", href: "/portal/training", icon: GraduationCap, roles: ["faculty", "admin"] },
  { label: "Users", href: "/portal/users", icon: Users, roles: ["admin"] },
  { label: "Audit log", href: "/portal/audit", icon: History, roles: ["faculty", "admin"] },
  { label: "Lab settings", href: "/portal/settings", icon: Settings, roles: ["admin"] },
  { label: "Digital ID", href: "/portal/id-card", icon: CreditCard, roles: ["student", "faculty", "admin"] },
]

export function canAccessPath(pathname: string, role: Role): boolean {
  const item = navigation
    .filter((candidate) => candidate.href !== "/portal")
    .find((candidate) => pathname.startsWith(candidate.href))
  return item ? item.roles.includes(role) : true
}
