import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  AdminApiError,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  type AdminRole,
} from "../admin/serverApi"
import AccountManagement from "../components/admin/AccountManagement"
import AdminIcon from "../components/admin/AdminIcon"
import AuditLogViewer from "../components/admin/AuditLogViewer"
import DashboardPanel from "../components/admin/DashboardPanel"
import GameSettingsPanel from "../components/admin/GameSettingsPanel"
import InstitutionManagement from "../components/admin/InstitutionManagement"
import QuestionManagement from "../components/admin/QuestionManagement"
import RankingManagement from "../components/admin/RankingManagement"

type AccessState = "loading" | "setup" | "login" | "checking" | "ready"

function returnToPrevious() {
  if (window.history.length > 1) {
    window.history.back()
    return
  }
  window.location.assign("/")
}

function AdminBackButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      className={compact ? "admin-header-back" : "admin-gate-back"}
      type="button"
      onClick={returnToPrevious}
      aria-label="이전 화면으로 돌아가기"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 5 8 12l7 7M8.5 12H20" />
      </svg>
      {!compact && <span>이전 화면</span>}
    </button>
  )
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      await loginAdmin(identifier, password)
      onLogin()
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "관리자 서버에 로그인하지 못했습니다.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-gate">
      <AdminBackButton />
      <form onSubmit={submit}>
        <img
          className="admin-gate-logo"
          src="/cyber-quest-lock-logo.png"
          alt="Cyber Quest"
        />
        <h1>관리자 로그인</h1>
        <label>
          <span>관리자 아이디</span>
          <input
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="관리자 아이디"
            required
          />
        </label>
        <label>
          <span>비밀번호</span>
          <div className="admin-password-field">
            <input
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 표시"}
              aria-pressed={passwordVisible}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="2.7" />
                {!passwordVisible && <path d="m4 4 16 16" />}
              </svg>
            </button>
          </div>
        </label>
        {error && <p className="admin-form-error">{error}</p>}
        <button className="admin-primary" type="submit" disabled={submitting}>
          {submitting ? "확인 중…" : "로그인"}
        </button>
        <a href="/">게임으로 돌아가기</a>
      </form>
    </div>
  )
}

interface AdminPageTitle {
  prefix: string
  title: string
}

const PAGE_TITLES: AdminPageTitle[] = [
  { prefix: "/admin/institutions", title: "기관 · 세션 | CYBER QUEST" },
  { prefix: "/admin/rankings", title: "탈출 순위 | CYBER QUEST" },
  { prefix: "/admin/accounts", title: "관리자 계정 | CYBER QUEST" },
  { prefix: "/admin/logs", title: "운영 로그 | CYBER QUEST" },
  { prefix: "/admin/settings", title: "게임 설정 | CYBER QUEST" },
  { prefix: "/admin/questions", title: "문제 관리 | CYBER QUEST" },
]

export default function AdminScreen() {
  const [accessState, setAccessState] = useState<AccessState>("loading")
  const [accessMessage, setAccessMessage] = useState("")
  const [roles, setRoles] = useState<AdminRole[]>([])

  const hasRole = useCallback(
    (...allowed: AdminRole[]) => roles.some((role) => allowed.includes(role)),
    [roles],
  )

  useEffect(() => {
    const path = window.location.pathname
    const match = PAGE_TITLES.find((entry) => path.startsWith(entry.prefix))
    if (match) {
      document.title = match.title
    } else if (accessState === "login" || accessState === "setup") {
      document.title = "관리자 로그인 | CYBER QUEST"
    } else {
      document.title = "대시보드 | CYBER QUEST"
    }
  }, [accessState])

  const verifyAdmin = useCallback(async () => {
    setAccessState("checking")
    try {
      const session = await getAdminSession()
      if (!session.userId) throw new Error("관리자 세션을 확인하지 못했습니다.")
      setRoles(session.roles ?? [])
      setAccessState("ready")
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        setAccessState("login")
        return
      }
      setAccessMessage(
        error instanceof Error
          ? error.message
          : "관리자 API 서버에 연결하지 못했습니다.",
      )
      setAccessState("setup")
    }
  }, [])

  useEffect(() => {
    void verifyAdmin()
  }, [verifyAdmin])

  const signOut = async () => {
    await logoutAdmin().catch(() => undefined)
    setRoles([])
    setAccessState("login")
  }

  if (accessState === "loading" || accessState === "checking") {
    return <div className="admin-loading">관리자 권한을 확인하고 있습니다…</div>
  }

  if (accessState === "setup") {
    return (
      <div className="admin-gate">
        <AdminBackButton />
        <section>
          <img
            className="admin-gate-logo"
            src="/cyber-quest-lock-logo.png"
            alt="Cyber Quest"
          />
          <h1>관리자 서버 연결 필요</h1>
          <p>
            관리자 API 서버가 실행 중인지 확인하고 서버 전용 환경변수를 설정해
            주세요.
          </p>
          {accessMessage && <code>{accessMessage}</code>}
          <div className="admin-gate-actions">
            <button
              className="admin-primary"
              type="button"
              onClick={verifyAdmin}
            >
              다시 연결
            </button>
            <button type="button" onClick={returnToPrevious}>
              이전 화면
            </button>
          </div>
          <a href="/">게임으로 돌아가기</a>
        </section>
      </div>
    )
  }

  if (accessState === "login") return <AdminLogin onLogin={verifyAdmin} />

  const adminPath = window.location.pathname
  const isDashboard = adminPath === "/admin" || adminPath === "/admin/"
  const canManageContent = hasRole("content", "super")
  const canManageOperations = hasRole("operations", "super")
  const isSuper = hasRole("super")

  const adminHeader = (
    <header className="admin-header">
      <div className="admin-header-leading">
        <AdminBackButton compact />
        <a className="admin-brand" href="/admin" aria-label="관리자 초기 화면">
          <img src="/cyber-quest-lock-logo.png" alt="Cyber Quest" />
        </a>
      </div>
      <nav>
        <a className={isDashboard ? "active" : ""} href="/admin">
          <AdminIcon name="dashboard" />
          대시보드
        </a>
        {canManageContent && (
          <a
            className={adminPath.startsWith("/admin/questions") ? "active" : ""}
            href="/admin/questions"
          >
            <AdminIcon name="questions" />
            문제
          </a>
        )}
        {canManageOperations && (
          <a
            className={
              adminPath.startsWith("/admin/institutions") ? "active" : ""
            }
            href="/admin/institutions"
          >
            <AdminIcon name="institutions" />
            기관 · 세션
          </a>
        )}
        <a
          className={adminPath.startsWith("/admin/rankings") ? "active" : ""}
          href="/admin/rankings"
        >
          <AdminIcon name="ranking" />
          순위 · 결과
        </a>
        {canManageContent && (
          <a
            className={adminPath.startsWith("/admin/settings") ? "active" : ""}
            href="/admin/settings"
          >
            <AdminIcon name="settings" />
            게임 설정
          </a>
        )}
        {isSuper && (
          <a
            className={adminPath.startsWith("/admin/accounts") ? "active" : ""}
            href="/admin/accounts"
          >
            <AdminIcon name="accounts" />
            관리자 계정
          </a>
        )}
        <a
          className={adminPath.startsWith("/admin/logs") ? "active" : ""}
          href="/admin/logs"
        >
          <AdminIcon name="logs" />
          운영 로그
        </a>
        <a href="/">
          <AdminIcon name="game" />
          게임 화면
        </a>
        <button className="admin-logout" type="button" onClick={signOut}>
          <AdminIcon name="logout" />
          로그아웃
        </button>
      </nav>
    </header>
  )

  const content = adminPath.startsWith("/admin/institutions") ? (
    canManageOperations ? (
      <InstitutionManagement />
    ) : (
      <main className="admin-content">
        <p className="admin-empty">이 메뉴에 접근할 권한이 없습니다.</p>
      </main>
    )
  ) : adminPath.startsWith("/admin/rankings") ? (
    <RankingManagement />
  ) : adminPath.startsWith("/admin/accounts") ? (
    isSuper ? (
      <AccountManagement />
    ) : (
      <main className="admin-content">
        <p className="admin-empty">이 메뉴에 접근할 권한이 없습니다.</p>
      </main>
    )
  ) : adminPath.startsWith("/admin/logs") ? (
    <AuditLogViewer />
  ) : adminPath.startsWith("/admin/settings") ? (
    canManageContent ? (
      <GameSettingsPanel />
    ) : (
      <main className="admin-content">
        <p className="admin-empty">이 메뉴에 접근할 권한이 없습니다.</p>
      </main>
    )
  ) : adminPath.startsWith("/admin/questions") ? (
    canManageContent ? (
      <QuestionManagement />
    ) : (
      <main className="admin-content">
        <p className="admin-empty">이 메뉴에 접근할 권한이 없습니다.</p>
      </main>
    )
  ) : (
    <DashboardPanel />
  )

  return (
    <div className="admin-screen">
      {adminHeader}
      {content}
    </div>
  )
}
