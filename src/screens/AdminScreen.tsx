import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  createQuestions,
  deleteQuestion,
  importLegacyQuestions,
  listQuestions,
  saveQuestion,
} from "../admin/questionRepository"
import type {
  AdminQuestion,
  QuestionInput,
  QuestionStatus,
} from "../admin/types"
import {
  AdminApiError,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from "../admin/serverApi"
import DocumentImportPanel from "../components/admin/DocumentImportPanel"
import AdminIcon from "../components/admin/AdminIcon"
import InstitutionManagement from "../components/admin/InstitutionManagement"
import QuestionEditor from "../components/admin/QuestionEditor"
import RankingManagement from "../components/admin/RankingManagement"

type AccessState = "loading" | "setup" | "login" | "checking" | "ready"
type StatusFilter = "all" | QuestionStatus

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

export default function AdminScreen() {
  const [accessState, setAccessState] = useState<AccessState>("loading")
  const [accessMessage, setAccessMessage] = useState("")
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestion | null>(
    null,
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [notice, setNotice] = useState("")

  const verifyAdmin = useCallback(async () => {
    setAccessState("checking")
    try {
      const session = await getAdminSession()
      if (!session.userId) throw new Error("관리자 세션을 확인하지 못했습니다.")
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

  const refreshData = useCallback(async () => {
    setLoadingData(true)
    try {
      setQuestions(await listQuestions())
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "관리 데이터를 불러오지 못했습니다.",
      )
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (accessState === "ready") void refreshData()
  }, [accessState, refreshData])

  const filteredQuestions = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return questions.filter((question) => {
      const matchesStatus =
        statusFilter === "all" || question.status === statusFilter
      const matchesSearch =
        !keyword ||
        question.prompt.toLowerCase().includes(keyword) ||
        question.category.toLowerCase().includes(keyword) ||
        String(question.ordinal).includes(keyword)
      return matchesStatus && matchesSearch
    })
  }, [questions, search, statusFilter])

  const nextOrdinal =
    questions.reduce(
      (highest, question) => Math.max(highest, question.ordinal),
      0,
    ) + 1
  const publishedCount = questions.filter(
    (question) => question.status === "published",
  ).length
  const draftCount = questions.length - publishedCount

  const openNewQuestion = () => {
    setEditingQuestion(null)
    setEditorOpen(true)
  }

  const openQuestion = (question: AdminQuestion) => {
    setEditingQuestion(question)
    setEditorOpen(true)
  }

  const handleSave = async (input: QuestionInput) => {
    await saveQuestion(input)
    setEditorOpen(false)
    setNotice(input.id ? "문제를 수정했습니다." : "새 문제를 추가했습니다.")
    await refreshData()
  }

  const handleDelete = async (question: AdminQuestion) => {
    const confirmed = window.confirm(
      `${question.ordinal}번 문제를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    )
    if (!confirmed) return

    try {
      await deleteQuestion(question.id)
      setNotice(`${question.ordinal}번 문제를 삭제했습니다.`)
      await refreshData()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "문제를 삭제하지 못했습니다.",
      )
    }
  }

  const handleLegacyImport = async () => {
    try {
      const imported = await importLegacyQuestions()
      setNotice(
        imported.length
          ? `기존 게임 문제 ${imported.length}개를 등록했습니다.`
          : "등록되지 않은 기존 문제가 없습니다.",
      )
      await refreshData()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "기존 문제를 등록하지 못했습니다.",
      )
    }
  }

  const handleDocumentImport = async (inputs: QuestionInput[]) => {
    await createQuestions(inputs)
    setNotice(`${inputs.length}개 문제를 검수 대기 초안으로 추가했습니다.`)
    await refreshData()
  }

  const signOut = async () => {
    await logoutAdmin().catch(() => undefined)
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
  const adminHeader = (
    <header className="admin-header">
      <div className="admin-header-leading">
        <AdminBackButton compact />
        <a className="admin-brand" href="/admin" aria-label="관리자 초기 화면">
          <img src="/cyber-quest-lock-logo.png" alt="Cyber Quest" />
        </a>
      </div>
      <nav>
        <a className={adminPath === "/admin" ? "active" : ""} href="/admin">
          <AdminIcon name="questions" />
          문제
        </a>
        <a
          className={
            adminPath.startsWith("/admin/institutions") ? "active" : ""
          }
          href="/admin/institutions"
        >
          <AdminIcon name="institutions" />
          기관 · 응시
        </a>
        <a
          className={adminPath.startsWith("/admin/rankings") ? "active" : ""}
          href="/admin/rankings"
        >
          <AdminIcon name="ranking" />
          탈출 순위
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

  if (window.location.pathname.startsWith("/admin/institutions")) {
    return (
      <div className="admin-screen">
        {adminHeader}
        <InstitutionManagement />
      </div>
    )
  }

  if (window.location.pathname.startsWith("/admin/rankings")) {
    return (
      <div className="admin-screen">
        {adminHeader}
        <RankingManagement />
      </div>
    )
  }

  return (
    <div className="admin-screen">
      {adminHeader}

      <main className="admin-content">
        <section className="admin-page-heading">
          <div>
            <h2>문제 관리</h2>
            <p>게임에 사용할 문제를 등록하고 공개 상태를 관리합니다.</p>
          </div>
          <div>
            <button
              className="admin-action-with-icon"
              type="button"
              onClick={() => setImportOpen(true)}
            >
              <AdminIcon name="upload" />
              PDF · HWP 가져오기
            </button>
            <button
              className="admin-primary admin-action-with-icon"
              type="button"
              onClick={openNewQuestion}
            >
              <AdminIcon name="plus" />
              문제 추가
            </button>
          </div>
        </section>

        {notice && (
          <button
            className="admin-notice"
            type="button"
            onClick={() => setNotice("")}
          >
            {notice}
            <span>닫기</span>
          </button>
        )}

        <section className="admin-stat-grid" aria-label="문제 현황">
          <article>
            <span>전체 문제</span>
            <strong>{questions.length}</strong>
          </article>
          <article>
            <span>공개</span>
            <strong>{publishedCount}</strong>
          </article>
          <article>
            <span>검수 대기</span>
            <strong>{draftCount}</strong>
          </article>
        </section>

        <section className="admin-question-section">
          <div className="admin-toolbar">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="번호, 분류, 문제 내용 검색"
              aria-label="문제 검색"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              aria-label="공개 상태 필터"
            >
              <option value="all">전체 상태</option>
              <option value="published">공개</option>
              <option value="draft">초안</option>
            </select>
            <button
              className="admin-action-with-icon"
              type="button"
              onClick={handleLegacyImport}
            >
              <AdminIcon name="sync" />
              기존 게임 문제 동기화
            </button>
          </div>

          <div className="admin-question-table">
            <div className="admin-table-head" aria-hidden="true">
              <span>번호</span>
              <span>분류 / 문제</span>
              <span>보기</span>
              <span>상태</span>
              <span>관리</span>
            </div>
            {loadingData ? (
              <p className="admin-empty">문제를 불러오고 있습니다…</p>
            ) : filteredQuestions.length === 0 ? (
              <p className="admin-empty">조건에 맞는 문제가 없습니다.</p>
            ) : (
              filteredQuestions.map((question) => (
                <article key={question.id}>
                  <b>{question.ordinal}</b>
                  <button type="button" onClick={() => openQuestion(question)}>
                    <small>{question.category}</small>
                    <strong>{question.prompt}</strong>
                  </button>
                  <span>{question.options.length}개</span>
                  <i className={question.status}>
                    {question.status === "published" ? "공개" : "초안"}
                  </i>
                  <div>
                    <button
                      type="button"
                      onClick={() => openQuestion(question)}
                    >
                      <AdminIcon name="edit" />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(question)}
                    >
                      <AdminIcon name="delete" />
                      삭제
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      {editorOpen && (
        <QuestionEditor
          question={editingQuestion}
          nextOrdinal={nextOrdinal}
          onSave={handleSave}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {importOpen && (
        <DocumentImportPanel
          nextOrdinal={nextOrdinal}
          onImport={handleDocumentImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
