import { useMemo, useState, type ChangeEvent } from "react"
import { extractQuestionDocument } from "../../admin/documentExtraction"
import {
  registerQuestionDocument,
  updateQuestionDocument,
} from "../../admin/questionRepository"
import type { ExtractedQuestion, QuestionInput } from "../../admin/types"

interface DocumentImportPanelProps {
  userId: string
  nextOrdinal: number
  onImport: (questions: QuestionInput[]) => Promise<void>
  onClose: () => void
}

function isImportable(question: ExtractedQuestion) {
  return Boolean(
    question.prompt.trim() &&
      question.options.length >= 2 &&
      question.correctAnswer >= 0 &&
      question.correctAnswer < question.options.length,
  )
}

export default function DocumentImportPanel({
  userId,
  nextOrdinal,
  onImport,
  onClose,
}: DocumentImportPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [rawText, setRawText] = useState("")
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const selectedCount = useMemo(
    () =>
      [...selected].filter((index) => isImportable(questions[index])).length,
    [questions, selected],
  )

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return

    setFile(nextFile)
    setQuestions([])
    setSelected(new Set())
    setRawText("")
    setError("")
    setProcessing(true)
    let registeredId: string | null = null

    try {
      const document = await registerQuestionDocument(nextFile, userId)
      registeredId = document.id
      setDocumentId(document.id)
      const result = await extractQuestionDocument(nextFile)
      setRawText(result.text)
      setQuestions(result.questions)
      setSelected(
        new Set(
          result.questions
            .map((question, index) => (isImportable(question) ? index : -1))
            .filter((index) => index >= 0),
        ),
      )
      await updateQuestionDocument(
        document.id,
        "review",
        result.text,
        result.questions.length,
      )

      if (result.questions.length === 0) {
        setError(
          "텍스트는 추출했지만 문제 번호와 보기를 구분하지 못했습니다. 원문 형식을 확인해 주세요.",
        )
      }
    } catch (extractError) {
      const message =
        extractError instanceof Error
          ? extractError.message
          : "문서를 처리하지 못했습니다."
      setError(message)
      if (registeredId) {
        await updateQuestionDocument(
          registeredId,
          "failed",
          "",
          0,
          message,
        ).catch(() => undefined)
      }
    } finally {
      setProcessing(false)
      event.target.value = ""
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
    if (!file || !documentId || selectedCount === 0) return
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
          `${file.name}${
            question.sourceNumber ? ` ${question.sourceNumber}번` : ""
          }`,
        status: "draft",
        sourceDocumentId: documentId,
      }))

    try {
      await onImport(inputs)
      await updateQuestionDocument(
        documentId,
        "completed",
        rawText,
        inputs.length,
      )
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
        className="admin-import-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-import-title"
      >
        <header>
          <div>
            <small>DOCUMENT IMPORT</small>
            <h2 id="document-import-title">문제지에서 문제 가져오기</h2>
            <p>
              PDF·HWP·HWPX 원문은 비공개로 저장되며 결과는 초안으로 추가됩니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="가져오기 닫기">
            ×
          </button>
        </header>

        <label
          className={`admin-file-drop ${processing ? "is-processing" : ""}`}
        >
          <input
            type="file"
            accept=".pdf,.hwp,.hwpx,application/pdf"
            onChange={selectFile}
            disabled={processing || saving}
          />
          <b>{processing ? "문서를 분석하고 있습니다…" : "문제지 선택"}</b>
          <span>최대 20MB · 스캔 PDF는 문자 인식 후 업로드</span>
        </label>

        {file && (
          <div className="admin-import-summary">
            <span>
              <small>파일</small>
              <b>{file.name}</b>
            </span>
            <span>
              <small>추출</small>
              <b>{questions.length}문항</b>
            </span>
            <span>
              <small>선택</small>
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
                      {question.correctAnswer + 1}번
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

        {rawText && (
          <details className="admin-source-preview">
            <summary>추출 원문 일부 확인</summary>
            <pre>{rawText.slice(0, 1800)}</pre>
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
