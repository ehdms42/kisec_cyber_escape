import type { Question } from "../data/questions"
import type { QuestionParts } from "../game/question"

interface QuestionPanelProps {
  question: Question
  parts: QuestionParts
  selectedAnswer: number | null
  onSelectAnswer: (index: number) => void
}

const OPTION_PREFIX_PATTERN = /^[①②③④⑤]\s*/
const DETAIL_LABEL_PATTERN = /^([\uac00-힣]\.)\s*(.+)$/

export default function QuestionPanel({
  question,
  parts,
  selectedAnswer,
  onSelectAnswer,
}: QuestionPanelProps) {
  const answered = selectedAnswer !== null

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
          const isCorrect = answered && index === question.answer
          const isWrong = answered && index === selectedAnswer && !isCorrect
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
              disabled={answered}
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
    </>
  )
}
