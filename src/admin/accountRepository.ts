import type { AdminRole } from "./serverApi"
import { adminRequest } from "./serverApi"

export interface AdminAccount {
  id: string
  loginId: string
  displayName: string
  roles: AdminRole[]
  active: boolean
  createdByLoginId: string | null
  lastLoginAt: string | null
  createdAt: string
}

export async function listAdminAccounts(): Promise<AdminAccount[]> {
  return adminRequest<AdminAccount[]>("/accounts")
}

export async function createAdminAccount(input: {
  loginId: string
  displayName: string
  roles: AdminRole[]
  password: string
}) {
  return adminRequest<AdminAccount>("/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function updateAdminAccount(
  id: string,
  input: Partial<{
    displayName: string
    roles: AdminRole[]
    active: boolean
    password: string
  }>,
) {
  return adminRequest<AdminAccount>(`/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}
