"use client"

import { validateFirestoreId } from "@/lib/security"
import type {
  AuditLogEntry,
  Booking,
  CursorPage,
  LabConfig,
  Machine,
  MachineAvailability,
  MaintenanceWindow,
  ManagedProfile,
  PortalNotification,
  Profile,
  ServiceResult,
  TrainingRecord,
} from "@/lib/types"
import { apiRequest } from "@/services/api-client"

type MachinePayload = Pick<Machine, "name" | "description" | "department" | "location" | "image_url" | "specifications" | "is_active" | "requires_training">

function invalidId<T>(label: string): ServiceResult<T> {
  return { data: null, error: { message: `Invalid ${label}.`, code: "invalid_id" } }
}

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

async function getCursorPage<T>(path: string, cursorHeader: string): Promise<ServiceResult<CursorPage<T>>> {
  const result = await apiRequest<T[]>(path)
  if (result.error) return result

  if (!Array.isArray(result.data)) {
    return {
      data: null,
      error: { message: "The service returned an invalid page.", code: "invalid_response" },
      response: result.response,
    }
  }

  const rawCursor = result.response?.headers[cursorHeader.toLowerCase()]?.trim() || ""
  if (rawCursor && (rawCursor.length > 2048 || !/^[a-zA-Z0-9_-]+$/.test(rawCursor))) {
    return {
      data: null,
      error: { message: "The service returned an invalid page cursor.", code: "invalid_response" },
      response: result.response,
    }
  }

  const nextCursor = rawCursor || null
  return {
    data: { items: result.data, nextCursor },
    error: null,
    response: result.response,
  }
}

export const machineService = {
  getMachines(): Promise<ServiceResult<Machine[]>> {
    return apiRequest<Machine[]>("/api/machines")
  },

  getMachine(id: string): Promise<ServiceResult<Machine>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("machine ID"))
    return apiRequest<Machine>(`/api/machines/${encodeURIComponent(id)}`)
  },

  createMachine(payload: MachinePayload): Promise<ServiceResult<Machine>> {
    return apiRequest<Machine>("/api/machines", { method: "POST", body: payload })
  },

  updateMachine(id: string, payload: Partial<MachinePayload>): Promise<ServiceResult<Machine>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("machine ID"))
    return apiRequest<Machine>(`/api/machines/${encodeURIComponent(id)}`, { method: "PATCH", body: payload })
  },

  deleteMachine(id: string): Promise<ServiceResult<{ deleted: boolean; id?: string; machine?: Machine; message?: string }>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("machine ID"))
    return apiRequest(`/api/machines/${encodeURIComponent(id)}`, { method: "DELETE" })
  },

  getAvailability(id: string, date: string): Promise<ServiceResult<MachineAvailability>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("machine ID"))
    return apiRequest<MachineAvailability>(`/api/machines/${encodeURIComponent(id)}/availability?date=${encodeURIComponent(date)}`)
  },
}

export const bookingService = {
  getBookings(params: {
    date_from?: string
    date_to?: string
    status?: string
    machine_id?: string
    student_id?: string
  } = {}): Promise<ServiceResult<Booking[]>> {
    return apiRequest<Booking[]>(`/api/bookings${queryString(params)}`)
  },

  createBooking(payload: Pick<Booking, "machine_id" | "booking_date" | "start_time" | "end_time" | "purpose">): Promise<ServiceResult<Booking>> {
    return apiRequest<Booking>("/api/bookings", { method: "POST", body: payload })
  },

  cancelBooking(id: string): Promise<ServiceResult<Booking>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("booking ID"))
    return apiRequest<Booking>(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: "PATCH" })
  },

  reviewBooking(id: string, status: "approved" | "rejected", comments = ""): Promise<ServiceResult<Booking>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("booking ID"))
    return apiRequest<Booking>(`/api/bookings/${encodeURIComponent(id)}/review`, {
      method: "PATCH",
      body: { status, comments },
    })
  },
}

export const maintenanceService = {
  getWindows(): Promise<ServiceResult<MaintenanceWindow[]>> {
    return apiRequest<MaintenanceWindow[]>("/api/maintenance-windows")
  },

  createWindow(payload: {
    scope: "machine" | "global"
    machine_id?: string
    start_date: string
    start_time: string
    end_date: string
    end_time: string
    reason: string
  }): Promise<ServiceResult<MaintenanceWindow>> {
    return apiRequest<MaintenanceWindow>("/api/maintenance-windows", { method: "POST", body: payload })
  },

  updateWindow(id: string, payload: { status?: "active" | "cancelled"; reason?: string }): Promise<ServiceResult<MaintenanceWindow>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("maintenance window ID"))
    return apiRequest<MaintenanceWindow>(`/api/maintenance-windows/${encodeURIComponent(id)}`, { method: "PATCH", body: payload })
  },

  cancelWindow(id: string): Promise<ServiceResult<MaintenanceWindow>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("maintenance window ID"))
    return apiRequest<MaintenanceWindow>(`/api/maintenance-windows/${encodeURIComponent(id)}`, { method: "DELETE" })
  },
}

export const trainingService = {
  getRecords(params: { student_id?: string; machine_id?: string } = {}): Promise<ServiceResult<TrainingRecord[] | TrainingRecord | null>> {
    return apiRequest(`/api/training-records${queryString(params)}`)
  },

  saveRecord(payload: {
    student_id?: string
    student_email?: string
    machine_id: string
    status: "active" | "revoked"
    notes?: string
  }): Promise<ServiceResult<TrainingRecord>> {
    return apiRequest<TrainingRecord>("/api/training-records", { method: "POST", body: payload })
  },
}

export const userService = {
  getUsers(params: { status?: string; role?: string; cursor?: string; limit?: number } = {}): Promise<ServiceResult<CursorPage<ManagedProfile>>> {
    return getCursorPage<ManagedProfile>(`/api/users${queryString({
      status: params.status,
      role: params.role,
      cursor: params.cursor,
      limit: params.limit === undefined ? undefined : String(params.limit),
    })}`, "X-Users-Next-Cursor")
  },

  updateStatus(id: string, status: "active" | "suspended"): Promise<ServiceResult<ManagedProfile>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("user ID"))
    return apiRequest<ManagedProfile>(`/api/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } })
  },

  updateRole(id: string, role: "student" | "faculty" | "admin"): Promise<ServiceResult<ManagedProfile>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("user ID"))
    return apiRequest<ManagedProfile>(`/api/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: { role } })
  },
}

export const facultyRequestService = {
  getPending(): Promise<ServiceResult<Profile[]>> {
    return apiRequest<Profile[]>("/api/profile/faculty-requests")
  },

  approve(id: string): Promise<ServiceResult<Profile>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("user ID"))
    return apiRequest<Profile>(`/api/profile/${encodeURIComponent(id)}/approve`, { method: "PATCH" })
  },

  reject(id: string, reason: string): Promise<ServiceResult<Profile>> {
    if (!validateFirestoreId(id)) return Promise.resolve(invalidId("user ID"))
    return apiRequest<Profile>(`/api/profile/${encodeURIComponent(id)}/reject`, { method: "PATCH", body: { reason } })
  },
}

export const labConfigService = {
  getConfig(): Promise<ServiceResult<LabConfig>> {
    return apiRequest<LabConfig>("/api/lab-config")
  },

  updateConfig(payload: Partial<Pick<LabConfig, "open_time" | "close_time" | "active_weekdays" | "max_advance_days" | "max_duration_hours">>): Promise<ServiceResult<LabConfig>> {
    return apiRequest<LabConfig>("/api/lab-config", { method: "PATCH", body: payload })
  },
}

export const notificationService = {
  getNotifications(): Promise<ServiceResult<PortalNotification[]>> {
    return apiRequest<PortalNotification[]>("/api/notifications")
  },

  markRead(ids: string[]): Promise<ServiceResult<{ ids: string[]; read_at: string }>> {
    return apiRequest("/api/notifications", { method: "PATCH", body: { ids: ids.slice(0, 50) } })
  },
}

export const auditService = {
  getAuditLog(params: { entity_type?: string; action?: string; cursor?: string; limit?: number } = {}): Promise<ServiceResult<CursorPage<AuditLogEntry>>> {
    return getCursorPage<AuditLogEntry>(`/api/audit-log${queryString({
      entity_type: params.entity_type,
      action: params.action,
      cursor: params.cursor,
      limit: params.limit === undefined ? undefined : String(params.limit),
    })}`, "X-Audit-Next-Cursor")
  },
}
