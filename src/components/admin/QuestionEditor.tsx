import { useEffect, useState, type FormEvent } from "react"
import type { AdminQuestion, QuestionInput } from "../../admin/types"

interface QuestionEditorProps {
  question: AdminQuestion | null
  nextOrdinal: number
  onSave: (input: QuestionInput) => Promise<void>
  onClose: () => void
}

function createInitialValue(
  question: AdminQuestion | null,
  nextOrdinal: number,
): QuestionInput {
  return question
    ? {
        id: question.id,
        ordinal: question.ordinal,
        category: question.category,
        prompt: question.prompt,
        options: [...question.options],
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        sourceReference: question.sourceReference,
        status: question.status,
        sourceDocumentId: question.sourceDocumentId,
        answerDocumentId: question.answerDocumentId,
      }
    : {
        ordinal: nextOrdinal,
        category: "",
        prompt: "",
        options: ["", "", "", ""],
        correctAnswer: 0,
        explanation: "",
        sourceReference: "",
        status: "draft",
        sourceDocumentId: null,
        answerDocumentId: null,
      }
}

export default function QuestionEditor({
  question,
  nextOrdinal,
  onSave,
  onClose,
}: QuestionEditorProps) {
  const [value, setValue] = useState(() =>
    createInitialValue(question, nextOrdinal),
  )
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(createInitialValue(question, nextOrdinal))
    setError("")
  }, [question, nextOrdinal])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [onClose, saving])

  const updateOption = (index: number, option: string) => {
    setValue((current) => ({
      ...current,
      options: current.options.map((item, optionIndex) =>
        optionIndex === index ? option : item,
      ),
    }))
  }

  const removeOption = (index: number) => {
    setValue((current) => {
      if (current.options.length <= 2) return current
      const options = current.options.filter(
        (_, optionIndex) => optionIndex !== index,
      )
      const correctAnswer =
        current.correctAnswer === index
          ? 0
          : current.correctAnswer > index
            ? current.correctAnswer - 1
            : current.correctAnswer
      return { ...current, options, correctAnswer }
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const options = value.options.map((option) => option.trim())

    if (!value.category.trim() || !value.prompt.trim()) {
      setError("분류와 문제 내용을 입력해 주세요.")
      return
    }
    if (options.some((option) => !option)) {
      setError("빈 보기 없이 모두 입력해 주세요.")
      return
    }
    if (value.correctAnswer >= options.length) {
      setError("정답으로 지정한 보기를 확인해 주세요.")
      return
    }

    setSaving(true)
    setError("")
    try {
      await onSave({
        ...value,
        ordinal: Math.max(1, Math.floor(value.ordinal)),
        category: value.category.trim(),
        prompt: value.prompt.trim(),
        options,
        explanation: value.explanation.trim(),
        sourceReference: value.sourceReference.trim(),
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "문제를 저장하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal" role="presentation" onMouseDown={onClose}>
      <form
        className="admin-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header>
          <div>
            <h2 id="question-editor-title">
              {question ? `${question.ordinal}번 문제 수정` : "문제 직접 추가"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="편집창 닫기">
            ×
          </button>
        </header>

        <div className="admin-editor-grid">
          <label>
            <span>문제 번호</span>
            <input
              type="number"
              min="1"
              value={value.ordinal}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  ordinal: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            <span>상태</span>
            <select
              value={value.status}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  status: event.target.value as QuestionInput["status"],
                }))
              }
            >
              <option value="draft">초안</option>
              <option value="published">공개</option>
            </select>
          </label>
        </div>

        <label>
          <span>분류</span>
          <input
            autoFocus
            value={value.category}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
            placeholder="예: 비밀번호 관리"
          />
        </label>

        <label>
          <span>문제 내용</span>
          <textarea
            rows={7}
            value={value.prompt}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                prompt: event.target.value,
              }))
            }
          />
        </label>

        <fieldset className="admin-option-editor">
          <legend>보기 및 정답</legend>
          {value.options.map((option, index) => (
            <div key={index}>
              <input
                type="radio"
                name="correct-answer"
                checked={value.correctAnswer === index}
                onChange={() =>
                  setValue((current) => ({
                    ...current,
                    correctAnswer: index,
                  }))
                }
                aria-label={`${index + 1}번 보기를 정답으로 지정`}
              />
              <b>{index + 1}</b>
              <input
                value={option}
                onChange={(event) => updateOption(index, event.target.value)}
                placeholder={`${index + 1}번 보기`}
              />
              <button
                type="button"
                onClick={() => removeOption(index)}
                disabled={value.options.length <= 2}
                aria-label={`${index + 1}번 보기 삭제`}
              >
                삭제
              </button>
            </div>
          ))}
          <button
            className="admin-add-option"
            type="button"
            onClick={() =>
              setValue((current) => ({
                ...current,
                options: [...current.options, ""],
              }))
            }
            disabled={value.options.length >= 8}
          >
            + 보기 추가
          </button>
        </fieldset>

        <label>
          <span>해설</span>
          <textarea
            rows={3}
            value={value.explanation}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                explanation: event.target.value,
              }))
            }
          />
        </label>

        <label>
          <span>출처</span>
          <input
            value={value.sourceReference}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                sourceReference: event.target.value,
              }))
            }
            placeholder="문제은행 또는 문서명"
          />
        </label>

        {error && <p className="admin-form-error">{error}</p>}

        <footer>
          <button type="button" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className="admin-primary" type="submit" disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </footer>
      </form>
    </div>
  )
}
