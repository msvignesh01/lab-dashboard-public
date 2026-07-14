export type Role = "student" | "faculty" | "admin"

export type ProfileStatus = "active" | "pending_approval" | "suspended"

export interface AuthUser {
  id: string
  uid: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
  photoURL: string | null
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  requested_role: Role
  status: ProfileStatus
  department: string
  phone?: string
  register_number?: string
  specialization?: string
  year_of_passout?: string
  approved_by?: string | null
  approved_at?: string | null
  suspended_at?: string | null
  email_verified_at?: string | null
  created_at: string
  updated_at: string
  bootstrap_admin?: boolean
  faculty_rejection_reason?: string
}

export interface ManagedProfile extends Profile {
  auth_disabled?: boolean | null
  auth_email_verified?: boolean | null
  auth_sync_status?: "pending" | "failed" | "in_sync" | null
  auth_sync_target?: "active" | "suspended" | null
  auth_sync_recoverable?: boolean
}

export interface ServiceError {
  message: string
  code: string
  status?: number
}

export interface ServiceResponseMetadata {
  headers: Readonly<Record<string, string>>
}

export type ServiceResult<T> =
  | { data: T; error: null; response?: ServiceResponseMetadata }
  | { data: null; error: ServiceError; response?: ServiceResponseMetadata }

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface Machine {
  id: string
  name: string
  description?: string
  department?: string
  location?: string
  image_url?: string
  specifications?: Record<string, unknown>
  is_active: boolean
  requires_training: boolean
  created_at?: string
  updated_at?: string
}

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled"

export interface Booking {
  id: string
  machine_id: string
  student_id: string
  booking_date: string
  start_time: string
  end_time: string
  purpose: string
  status: BookingStatus
  faculty_id?: string | null
  faculty_comments?: string
  created_at: string
  updated_at: string
  machines?: Machine | null
  profiles?: Pick<Profile, "id" | "full_name"> | null
}

export interface AvailabilityInterval {
  start_minute: number
  end_minute: number
  start_time: string
  end_time: string
  source: "available" | "booking" | "maintenance" | "lab_hours"
  label?: string
}

export interface MachineAvailability {
  machine: Pick<Machine, "id" | "name" | "is_active" | "requires_training">
  date: string
  lab_config: LabConfig
  eligible: boolean
  training_record: TrainingRecord | null
  blocked_intervals: AvailabilityInterval[]
  available_intervals: AvailabilityInterval[]
  booking_intervals: AvailabilityInterval[]
  maintenance_intervals: AvailabilityInterval[]
}

export interface LabConfig {
  id: string
  timezone: "Asia/Kolkata" | string
  timezone_offset_minutes: number
  open_time: string
  close_time: string
  active_weekdays: number[]
  max_advance_days: number
  max_duration_hours: number
  updated_at?: string | null
  updated_by?: string | null
}

export interface MaintenanceWindow {
  id: string
  scope: "machine" | "global"
  machine_id?: string | null
  start_at: string
  end_at: string
  reason: string
  status: "active" | "cancelled"
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface TrainingRecord {
  id: string
  student_id: string
  machine_id: string
  status: "active" | "revoked"
  approved_by?: string | null
  approved_at?: string | null
  revoked_at?: string | null
  notes?: string
  updated_by?: string
  created_at?: string
  updated_at?: string
}

export interface PortalNotification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  entity?: { type?: string; id?: string }
  read_at?: string | null
  channels?: {
    in_app: string
    email: string
    email_reason?: string | null
  }
  created_at: string
  updated_at?: string
}

export interface AuditLogEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string
  actor_uid?: string
  actor_role?: Role
  metadata?: Record<string, unknown>
  created_at: string
}

export interface SignupMetadata {
  full_name: string
  role: "student" | "faculty"
  department: string
  phone?: string
  register_number?: string
  specialization?: string
  year_of_passout?: string
}

export type AccountAccessState =
  | "initializing"
  | "signed_out"
  | "email_unverified"
  | "profile_error"
  | "profile_missing"
  | "pending_approval"
  | "suspended"
  | "profile_inactive"
  | "active"
