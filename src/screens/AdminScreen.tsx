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
  listQuestionDocuments,
  listQuestions,
  saveQuestion,
} from "../admin/questionRepository"
import type {
  AdminQuestion,
  QuestionDocument,
  QuestionInput,
  QuestionStatus,
} from "../admin/types"
import DocumentImportPanel from "../components/admin/DocumentImportPanel"
import InstitutionManagement from "../components/admin/InstitutionManagement"
import QuestionEditor from "../components/admin/QuestionEditor"
import RankingManagement from "../components/admin/RankingManagement"
import {
  isAdminDemoMode,
  isSupabaseConfigured,
  supabase,
} from "../lib/supabase"

type AccessState = "loading" | "setup" | "login" | "checking" | "ready" | "forbidden"
type StatusFilter = "all" | QuestionStatus

const DOCUMENT_STATUS_LABEL: Record<QuestionDocument["status"], string> = {
  processing: "처리 중",
  review: "검수 대기",
  completed: "등록 완료",
  failed: "처리 실패",
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return

    setSubmitting(true)
    setError("")
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) setError("이메일 또는 비밀번호를 확인해 주세요.")
    else onLogin()
    setSubmitting(false)
  }

  return (
    <div className="admin-gate">
      <form onSubmit={submit}>
        <small>AUTHORIZED PERSONNEL ONLY</small>
        <h1>관리자 로그인</h1>
        <p>문제와 배포 정보를 관리할 권한이 있는 계정으로 로그인하세요.</p>
        <label>
          <span>이메일</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
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
  const [userId, setUserId] = useState("")
  const [accessMessage, setAccessMessage] = useState("")
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [documents, setDocuments] = useState<QuestionDocument[]>([])
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
    if (isAdminDemoMode) {
      setUserId("demo-admin")
      setAccessState("ready")
      return
    }
    if (!isSupabaseConfigured || !supabase) {
      setAccessState("setup")
      return
    }

    setAccessState("checking")
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setAccessState("login")
      return
    }

    const { data, error } = await supabase
      .from("admin_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error || !data) {
      setUserId(user.id)
      setAccessMessage(
        error
          ? "관리자 권한을 확인하지 못했습니다. 데이터베이스 설정을 확인해 주세요."
          : "이 계정에는 관리자 권한이 없습니다.",
      )
      setAccessState("forbidden")
      return
    }

    setUserId(user.id)
    setAccessState("ready")
  }, [])

  useEffect(() => {
    void verifyAdmin()
    if (!supabase) return

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void verifyAdmin())
    return () => subscription.unsubscribe()
  }, [verifyAdmin])

  const refreshData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [nextQuestions, nextDocuments] = await Promise.all([
        listQuestions(),
        listQuestionDocuments(),
      ])
      setQuestions(nextQuestions)
      setDocuments(nextDocuments)
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
    if (supabase) await supabase.auth.signOut()
    setAccessState("login")
    setUserId("")
  }

  if (accessState === "loading" || accessState === "checking") {
    return <div className="admin-loading">관리자 권한을 확인하고 있습니다…</div>
  }

  if (accessState === "setup") {
    return (
      <div className="admin-gate">
        <section>
          <small>SETUP REQUIRED</small>
          <h1>관리자 서버 연결 필요</h1>
          <p>
            `.env.local`에 Supabase URL과 Publishable Key를 설정하고
            데이터베이스 마이그레이션을 적용해 주세요.
          </p>
          <code>VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY</code>
          <a href="/">게임으로 돌아가기</a>
        </section>
      </div>
    )
  }

  if (accessState === "login") return <AdminLogin onLogin={verifyAdmin} />

  if (accessState === "forbidden") {
    return (
      <div className="admin-gate">
        <section>
          <small>ACCESS DENIED</small>
          <h1>관리자 권한 없음</h1>
          <p>{accessMessage}</p>
          <button className="admin-primary" type="button" onClick={signOut}>
            다른 계정으로 로그인
          </button>
        </section>
      </div>
    )
  }

  const adminHeader = (
    <header className="admin-header">
      <div>
        <small>KISEC CYBER QUEST</small>
        <h1>운영 관리</h1>
      </div>
      <nav>
        {isAdminDemoMode && <span>개발 미리보기</span>}
        <a href="/admin">문제</a>
        <a href="/admin/institutions">기관 · 응시</a>
        <a href="/admin/rankings">탈출 순위</a>
        <a href="/">게임 화면</a>
        {!isAdminDemoMode && (
          <button type="button" onClick={signOut}>
            로그아웃
          </button>
        )}
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
            <small>QUESTION BANK</small>
            <h2>문제 관리</h2>
            <p>게임에 사용할 문제를 등록하고 공개 상태를 관리합니다.</p>
          </div>
          <div>
            <button type="button" onClick={() => setImportOpen(true)}>
              PDF · HWP 가져오기
            </button>
            <button
              className="admin-primary"
              type="button"
              onClick={openNewQuestion}
            >
              + 문제 추가
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

        <section
          className={`admin-question-health ${
            publishedCount >= 30 ? "is-ready" : "needs-questions"
          }`}
        >
          <b>{publishedCount >= 30 ? "게임 출제 가능" : "공개 문제 부족"}</b>
          <span>
            게임에는 공개 상태인 문제를 번호순으로 30개 출제합니다. 현재 공개
            문제는
            {` ${publishedCount}개`}입니다.
          </span>
        </section>

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
          <article>
            <span>업로드 문서</span>
            <strong>{documents.length}</strong>
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
            <button type="button" onClick={handleLegacyImport}>
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
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(question)}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="admin-document-section">
          <header>
            <div>
              <small>SOURCE DOCUMENTS</small>
              <h3>최근 업로드</h3>
            </div>
            <span>원문은 관리자만 접근할 수 있습니다.</span>
          </header>
          {documents.length === 0 ? (
            <p className="admin-empty">업로드한 문제지가 없습니다.</p>
          ) : (
            <div className="admin-document-list">
              {documents.slice(0, 8).map((document) => (
                <article key={document.id}>
                  <span>
                    <strong>{document.originalName}</strong>
                    <small>
                      {new Date(document.createdAt).toLocaleString("ko-KR")}
                    </small>
                  </span>
                  <b>{document.extractedCount}문항</b>
                  <i className={document.status}>
                    {DOCUMENT_STATUS_LABEL[document.status]}
                  </i>
                </article>
              ))}
            </div>
          )}
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
          userId={userId}
          nextOrdinal={nextOrdinal}
          onImport={handleDocumentImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
