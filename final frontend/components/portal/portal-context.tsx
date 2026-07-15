"use client"

import { createContext, useContext, useState } from "react"
import type { Role } from "@/lib/portal-data"

interface PortalContextValue {
  role: Role
  setRole: (role: Role) => void
}

const PortalContext = createContext<PortalContextValue | null>(null)

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("student")
  return <PortalContext.Provider value={{ role, setRole }}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) throw new Error("usePortal must be used inside PortalProvider")
  return context
}
