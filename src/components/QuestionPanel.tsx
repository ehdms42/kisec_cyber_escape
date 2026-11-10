import type { Question } from "../data/questions"
import type { QuestionParts } from "../game/question"

interface QuestionPanelProps {
  question: Question
  parts: QuestionParts
  selectedAnswer: number | null
  answerCorrect: boolean | null
  correctAnswer?: number | null
  answerPending: boolean
  onSelectAnswer: (index: number) => void
  revealedHints?: Record<number, string>
  hintPending?: boolean
  onRevealHint?: (hintIndex: number) => void
}

const OPTION_PREFIX_PATTERN = /^[①②③④⑤]\s*/
const DETAIL_LABEL_PATTERN = /^([\uac00-힣]\.)\s*(.+)$/

export default function QuestionPanel({
  question,
  parts,
  selectedAnswer,
  answerCorrect,
  correctAnswer = null,
  answerPending,
  onSelectAnswer,
  revealedHints = {},
  hintPending = false,
  onRevealHint,
}: QuestionPanelProps) {
  const answered = selectedAnswer !== null
  const hints = question.hints ?? []

  return (
    <>
      <section className="question-copy">
        {parts.context && <p className="question-context">{parts.context}</p>}
        <h2 className="question-title">{parts.prompt}</h2>
        {parts.details.length > 0 && (
          <ul className="question-details">
            {parts.details.map((line) => {
              const match = line.match(DETAIL_LABEL_PATTERN)

              return (
                <li key={line}>
                  {match ? (
                    <>
                      <b>{match[1]}</b>
                      <span>{match[2]}</span>
                    </>
                  ) : (
                    <span>{line}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="answer-list">
        {question.options.map((option, index) => {
          // 맞히면 고른 보기를, 틀리면 서버가 알려 준 정답 보기를 표시한다.
          const isCorrect =
            answered &&
            ((answerCorrect === true && index === selectedAnswer) ||
              (answerCorrect === false && index === correctAnswer))
          const isWrong =
            answered && answerCorrect === false && index === selectedAnswer
          const state = isCorrect
            ? "correct"
            : isWrong
              ? "wrong"
              : answered
                ? "muted"
                : ""

          return (
            <button
              key={option}
              className={`answer-row ${state}`}
              onClick={() => onSelectAnswer(index)}
              disabled={answered || answerPending}
            >
              <span className="answer-index">
                {String.fromCharCode(65 + index)}
              </span>
              <span>{option.replace(OPTION_PREFIX_PATTERN, "")}</span>
              <b>{isCorrect ? "✓" : isWrong ? "×" : ""}</b>
            </button>
          )
        })}
      </div>

      {hints.length > 0 && onRevealHint && !answered && (
        <div className="question-hints">
          {hints.map((hint, index) => {
            const revealedText = revealedHints[index]
            const previousHintLocked =
              index > 0 && revealedHints[index - 1] === undefined
            return revealedText !== undefined ? (
              <p className="question-hint-text" key={index}>
                <b>힌트 {index + 1}</b>
                <span>{revealedText}</span>
              </p>
            ) : (
              <button
                key={index}
                type="button"
                className="question-hint-trigger"
                disabled={hintPending || previousHintLocked}
                onClick={() => onRevealHint(index)}
              >
                힌트 {index + 1} 보기
                {hint.penalty > 0 && <small>-{hint.penalty}점</small>}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
