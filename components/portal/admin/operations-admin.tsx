"use client"

import { Settings2, Wrench } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminPageHeader, RoleBoundary } from "@/components/portal/admin/common"
import { MachineManager } from "@/components/portal/admin/machine-manager"
import { MaintenanceManager } from "@/components/portal/admin/maintenance-manager"

function OperationsContent() {
  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="Administration / Operations"
        title="Operations control"
        description="Maintain the equipment registry and schedule downtime. Every change is persisted through the production service and enforced by the booking API."
      />
      <Tabs defaultValue="machines" className="gap-5">
        <TabsList aria-label="Operations sections">
          <TabsTrigger value="machines"><Wrench aria-hidden="true" />Machines</TabsTrigger>
          <TabsTrigger value="maintenance"><Settings2 aria-hidden="true" />Maintenance</TabsTrigger>
        </TabsList>
        <TabsContent value="machines"><MachineManager /></TabsContent>
        <TabsContent value="maintenance"><MaintenanceManager /></TabsContent>
      </Tabs>
    </div>
  )
}

export function OperationsAdmin() {
  return <RoleBoundary roles={["faculty", "admin"]}><OperationsContent /></RoleBoundary>
}
