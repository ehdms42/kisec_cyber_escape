let csrfToken = ""

interface AdminSessionResponse {
  userId: string
  csrfToken: string
}

export class AdminApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "AdminApiError"
    this.status = status
  }
}

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message || "관리자 서버 요청에 실패했습니다."
  } catch {
    return "관리자 서버 요청에 실패했습니다."
  }
}

export async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase()
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken)
  }

  const response = await fetch(`/api/admin${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  })
  if (!response.ok) {
    if (response.status === 401) csrfToken = ""
    throw new AdminApiError(await responseMessage(response), response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function getAdminSession() {
  const session = await adminRequest<AdminSessionResponse>("/session")
  csrfToken = session.csrfToken
  return session
}

export async function loginAdmin(id: string, password: string) {
  const session = await adminRequest<AdminSessionResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ id, password }),
  })
  csrfToken = session.csrfToken
  return session
}

export async function logoutAdmin() {
  await adminRequest<void>("/logout", { method: "POST" })
  csrfToken = ""
}
