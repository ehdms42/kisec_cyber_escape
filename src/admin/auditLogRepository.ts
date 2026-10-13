import type { AdminRole } from "./serverApi"
import { adminRequest } from "./serverApi"

export interface AuditLogEntry {
  id: string
  createdAt: string
  adminLoginId: string
  adminDisplayName: string
  roles: AdminRole[]
  action: string
  targetType: string
  targetId: string | null
  reason: string | null
  before: unknown
  after: unknown
  ip: string | null
}

export async function listAuditLogs(
  filters: {
    adminLoginId?: string
    targetType?: string
    limit?: number
  } = {},
): Promise<AuditLogEntry[]> {
  const query = new URLSearchParams()
  if (filters.adminLoginId) query.set("adminLoginId", filters.adminLoginId)
  if (filters.targetType) query.set("targetType", filters.targetType)
  if (filters.limit) query.set("limit", String(filters.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return adminRequest<AuditLogEntry[]>(`/audit-logs${suffix}`)
}
