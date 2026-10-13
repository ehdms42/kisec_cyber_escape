import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createQuestions,
  deleteQuestion,
  importLegacyQuestions,
  listQuestions,
  saveQuestion,
} from "../../admin/questionRepository"
import type {
  AdminQuestion,
  QuestionInput,
  QuestionStatus,
} from "../../admin/types"
import DocumentImportPanel from "./DocumentImportPanel"
import AdminIcon from "./AdminIcon"
import QuestionEditor from "./QuestionEditor"

type StatusFilter = "all" | QuestionStatus

export default function QuestionManagement() {
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

  useEffect(() => void refreshData(), [refreshData])

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

  return (
    <main className="admin-content dashboard-page">
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

      <div className="dashboard-stat-row" aria-label="문제 현황">
        <article className="dashboard-stat-card">
          <span>전체 문제</span>
          <strong>{questions.length}</strong>
        </article>
        <article className="dashboard-stat-card">
          <span>공개</span>
          <strong>{publishedCount}</strong>
        </article>
        <article className="dashboard-stat-card">
          <span>검수 대기</span>
          <strong>{draftCount}</strong>
        </article>
      </div>

      <section className="dashboard-card">
        <div className="question-list-toolbar">
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
            <AdminIcon name="sync" />
            기존 게임 문제 동기화
          </button>
        </div>

        <div className="question-list-head" aria-hidden="true">
          <span>번호</span>
          <span>분류 / 문제</span>
          <span>보기</span>
          <span>상태</span>
          <span>관리</span>
        </div>

        {loadingData ? (
          <p className="dashboard-empty-row">문제를 불러오고 있습니다…</p>
        ) : filteredQuestions.length === 0 ? (
          <p className="dashboard-empty-row">조건에 맞는 문제가 없습니다.</p>
        ) : (
          <div className="question-list-rows">
            {filteredQuestions.map((question) => (
              <article className="question-row" key={question.id}>
                <b>{question.ordinal}</b>
                <button type="button" onClick={() => openQuestion(question)}>
                  <small>{question.category}</small>
                  <strong>{question.prompt}</strong>
                </button>
                <span>{question.options.length}개</span>
                <i
                  className={`admin-status-badge status-${
                    question.status === "published" ? "open" : "draft"
                  }`}
                >
                  {question.status === "published" ? "공개" : "초안"}
                </i>
                <div className="question-row-actions">
                  <button type="button" onClick={() => openQuestion(question)}>
                    <AdminIcon name="edit" />
                    수정
                  </button>
                  <button type="button" onClick={() => handleDelete(question)}>
                    <AdminIcon name="delete" />
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
    </main>
  )
}
