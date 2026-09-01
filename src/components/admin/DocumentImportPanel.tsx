import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { extractQuestionSet } from "../../admin/documentExtraction"
import {
  registerQuestionDocument,
  updateQuestionDocument,
} from "../../admin/questionRepository"
import type { ExtractedQuestion, QuestionInput } from "../../admin/types"

interface DocumentImportPanelProps {
  nextOrdinal: number
  onImport: (questions: QuestionInput[]) => Promise<void>
  onClose: () => void
}

type DocumentRole = "question" | "answer"

function isImportable(question: ExtractedQuestion) {
  return Boolean(
    question.prompt.trim() &&
      question.options.length >= 2 &&
      question.correctAnswer >= 0 &&
      question.correctAnswer < question.options.length,
  )
}

export default function DocumentImportPanel({
  nextOrdinal,
  onImport,
  onClose,
}: DocumentImportPanelProps) {
  const [questionFile, setQuestionFile] = useState<File | null>(null)
  const [answerFile, setAnswerFile] = useState<File | null>(null)
  const [questionDocumentId, setQuestionDocumentId] = useState<string | null>(
    null,
  )
  const [answerDocumentId, setAnswerDocumentId] = useState<string | null>(null)
  const [questionText, setQuestionText] = useState("")
  const [answerText, setAnswerText] = useState("")
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return

      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ]
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  const selectedCount = useMemo(
    () =>
      [...selected].filter((index) => isImportable(questions[index])).length,
    [questions, selected],
  )

  const selectFile = (
    role: DocumentRole,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const nextFile = event.target.files?.[0] ?? null
    if (role === "question") setQuestionFile(nextFile)
    else setAnswerFile(nextFile)
    setQuestionDocumentId(null)
    setAnswerDocumentId(null)
    setQuestionText("")
    setAnswerText("")
    setQuestions([])
    setSelected(new Set())
    setError("")
  }

  const analyzeDocuments = async () => {
    if (!questionFile || !answerFile || processing) return
    setProcessing(true)
    setError("")
    const pairId = crypto.randomUUID()
    let registeredQuestionId: string | null = null
    let registeredAnswerId: string | null = null

    try {
      const [questionDocument, answerDocument] = await Promise.all([
        registerQuestionDocument(questionFile, "question", pairId),
        registerQuestionDocument(answerFile, "answer", pairId),
      ])
      registeredQuestionId = questionDocument.id
      registeredAnswerId = answerDocument.id
      setQuestionDocumentId(questionDocument.id)
      setAnswerDocumentId(answerDocument.id)

      const result = await extractQuestionSet(questionFile, answerFile)
      setQuestionText(result.questionText)
      setAnswerText(result.answerText)
      setQuestions(result.questions)
      setSelected(
        new Set(
          result.questions
            .map((question, index) => (isImportable(question) ? index : -1))
            .filter((index) => index >= 0),
        ),
      )

      await Promise.all([
        updateQuestionDocument(
          questionDocument.id,
          "review",
          result.questionText,
          result.questions.length,
        ),
        updateQuestionDocument(
          answerDocument.id,
          "review",
          result.answerText,
          result.questions.filter((question) => question.correctAnswer >= 0)
            .length,
        ),
      ])

      if (result.questions.length === 0) {
        setError(
          "문제지에서 문제 번호와 보기를 찾지 못했습니다. 추출 원문과 문서 형식을 확인해 주세요.",
        )
      } else if (!result.questions.some(isImportable)) {
        setError(
          "문제와 해답의 번호를 연결하지 못했습니다. 두 문서의 문제 번호 표기를 확인해 주세요.",
        )
      }
    } catch (extractError) {
      const message =
        extractError instanceof Error
          ? extractError.message
          : "문서 세트를 처리하지 못했습니다."
      setError(message)
      await Promise.all(
        [registeredQuestionId, registeredAnswerId]
          .filter((id): id is string => Boolean(id))
          .map((id) =>
            updateQuestionDocument(id, "failed", "", 0, message).catch(
              () => undefined,
            ),
          ),
      )
    } finally {
      setProcessing(false)
    }
  }

  const toggleQuestion = (index: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const importSelected = async () => {
    if (
      !questionFile ||
      !answerFile ||
      !questionDocumentId ||
      !answerDocumentId ||
      selectedCount === 0
    ) {
      return
    }
    setSaving(true)
    setError("")

    const inputs = questions
      .map((question, index) => ({ question, index }))
      .filter(
        ({ question, index }) => selected.has(index) && isImportable(question),
      )
      .map<QuestionInput>(({ question }, offset) => ({
        ordinal: nextOrdinal + offset,
        category: question.category || "미분류",
        prompt: question.prompt,
        options: question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        sourceReference:
          question.sourceReference ||
          `${questionFile.name} ${question.sourceNumber ?? offset + 1}번`,
        status: "draft",
        sourceDocumentId: questionDocumentId,
        answerDocumentId,
      }))

    try {
      await onImport(inputs)
      await Promise.all([
        updateQuestionDocument(
          questionDocumentId,
          "completed",
          questionText,
          inputs.length,
        ),
        updateQuestionDocument(
          answerDocumentId,
          "completed",
          answerText,
          inputs.length,
        ),
      ])
      onClose()
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "추출한 문제를 저장하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal admin-import-modal" role="presentation">
      <section
        ref={dialogRef}
        className="admin-import-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-import-title"
      >
        <header>
          <div>
            <h2 id="document-import-title">문제 세트 가져오기</h2>
            <p>문제지 1부와 해답지 1부를 문제 번호로 맞춰 초안을 만듭니다.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="가져오기 닫기"
          >
            ×
          </button>
        </header>

        <div className="admin-document-pair">
          <label className="admin-file-drop">
            <input
              type="file"
              accept=".pdf,.hwp,.hwpx,application/pdf"
              onChange={(event) => selectFile("question", event)}
              disabled={processing || saving}
            />
            <b>{questionFile ? questionFile.name : "문제지 선택"}</b>
            <span>PDF · HWP · HWPX</span>
          </label>
          <label className="admin-file-drop">
            <input
              type="file"
              accept=".pdf,.hwp,.hwpx,application/pdf"
              onChange={(event) => selectFile("answer", event)}
              disabled={processing || saving}
            />
            <b>{answerFile ? answerFile.name : "해답지 선택"}</b>
            <span>문제지와 다른 형식도 가능</span>
          </label>
        </div>

        <button
          className="admin-pair-analyze"
          type="button"
          onClick={analyzeDocuments}
          disabled={!questionFile || !answerFile || processing || saving}
        >
          {processing ? "두 문서를 분석하고 있습니다…" : "문제·해답 맞춰보기"}
        </button>

        {questions.length > 0 && (
          <div className="admin-import-summary">
            <span>
              <small>문제지</small>
              <b>{questionFile?.name}</b>
            </span>
            <span>
              <small>추출</small>
              <b>{questions.length}문항</b>
            </span>
            <span>
              <small>등록 가능</small>
              <b>{selectedCount}문항</b>
            </span>
          </div>
        )}

        {error && <p className="admin-form-error">{error}</p>}

        {questions.length > 0 && (
          <div className="admin-extracted-list">
            {questions.map((question, index) => {
              const importable = isImportable(question)
              return (
                <label
                  className={`admin-extracted-question ${
                    question.warnings.length ? "has-warning" : ""
                  }`}
                  key={`${question.sourceNumber ?? "question"}-${index}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleQuestion(index)}
                    disabled={!importable}
                  />
                  <span>
                    <small>
                      {question.sourceNumber
                        ? `원문 ${question.sourceNumber}번`
                        : `추출 ${index + 1}번`}
                      <i>{question.category}</i>
                    </small>
                    <strong>{question.prompt || "본문 인식 실패"}</strong>
                    <em>
                      보기 {question.options.length}개 · 정답{" "}
                      {question.correctAnswer >= 0
                        ? `${question.correctAnswer + 1}번`
                        : "미확인"}
                    </em>
                    {question.warnings.length > 0 && (
                      <b>{question.warnings.join(" · ")}</b>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {(questionText || answerText) && (
          <details className="admin-source-preview">
            <summary>추출 원문 일부 확인</summary>
            <b>문제지</b>
            <pre>{questionText.slice(0, 1200)}</pre>
            <b>해답지</b>
            <pre>{answerText.slice(0, 1200)}</pre>
          </details>
        )}

        <footer>
          <button type="button" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            className="admin-primary"
            type="button"
            onClick={importSelected}
            disabled={selectedCount === 0 || processing || saving}
          >
            {saving ? "초안 저장 중…" : `${selectedCount}문항 초안으로 추가`}
          </button>
        </footer>
      </section>
    </div>
  )
}
