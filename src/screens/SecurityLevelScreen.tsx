import { useState } from "react"
import {
  diagnosedSecurityLevel,
  SECURITY_LEVEL_META,
  SECURITY_LEVELS,
  type SecurityLevel,
} from "../game/securityLevel"

interface SecurityLevelScreenProps {
  initialLevel: SecurityLevel
  onConfirm: (level: SecurityLevel) => void | Promise<void>
}

const DIAGNOSTIC_QUESTIONS = [
  {
    question: "업무 메일의 링크가 의심스러울 때 가장 먼저 할 행동은?",
    options: ["링크를 열어 확인", "발신자를 별도 경로로 확인", "동료에게 전달"],
    answer: 1,
  },
  {
    question: "같은 비밀번호를 여러 서비스에서 사용하면 위험한 주된 이유는?",
    options: [
      "로그인이 느려져서",
      "한 곳의 유출이 다른 계정으로 번져서",
      "비밀번호가 길어져서",
    ],
    answer: 1,
  },
  {
    question: "웹 요청 값이 DB 명령으로 해석되지 않게 하는 기본 대책은?",
    options: ["화면 색상 변경", "매개변수화된 쿼리 사용", "브라우저 캐시 삭제"],
    answer: 1,
  },
] as const

export default function SecurityLevelScreen({
  initialLevel,
  onConfirm,
}: SecurityLevelScreenProps) {
  const [mode, setMode] = useState<"choose" | "diagnose">("choose")
  const [step, setStep] = useState(0)
  const [diagnosticScore, setDiagnosticScore] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const submitLevel = async (level: SecurityLevel) => {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      await onConfirm(level)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "참여 정보를 확인하지 못했습니다.",
      )
      setSubmitting(false)
    }
  }

  const answerDiagnostic = (answer: number) => {
    const nextScore =
      diagnosticScore + (answer === DIAGNOSTIC_QUESTIONS[step].answer ? 1 : 0)
    if (step === DIAGNOSTIC_QUESTIONS.length - 1) {
      void submitLevel(diagnosedSecurityLevel(nextScore))
      return
    }
    setDiagnosticScore(nextScore)
    setStep((value) => value + 1)
  }

  const question = DIAGNOSTIC_QUESTIONS[step]

  return (
    <div className="app-frame nickname-screen security-level-screen">
      <div className="title-room" aria-hidden="true" />
      <div className="nickname-shade" aria-hidden="true" />
      <section className="nickname-card security-level-card">
        <svg
          className="agent-badge-image security-level-badge"
          viewBox="0 0 160 160"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="level-frame" x1="35" y1="24" x2="126" y2="137">
              <stop offset="0" stopColor="#d8f4ff" />
              <stop offset=".28" stopColor="#4a9df2" />
              <stop offset=".65" stopColor="#1559bd" />
              <stop offset="1" stopColor="#06265d" />
            </linearGradient>
            <linearGradient id="level-face" x1="80" y1="35" x2="80" y2="127">
              <stop offset="0" stopColor="#174f9a" />
              <stop offset="1" stopColor="#061b40" />
            </linearGradient>
          </defs>
          <path
            d="M39 23h82l18 18v78l-18 18H39l-18-18V41z"
            fill="#020d25"
            transform="translate(0 5)"
          />
          <path
            d="M39 18h82l18 18v78l-18 18H39l-18-18V36z"
            fill="url(#level-frame)"
            stroke="#a9ddff"
            strokeWidth="3"
          />
          <path
            d="M45 28h70l13 13v68l-13 13H45l-13-13V41z"
            fill="url(#level-face)"
            stroke="#031b4a"
            strokeWidth="3"
          />
          <path
            d="M55 105V83M80 105V66M105 105V48"
            fill="none"
            stroke="#c9efff"
            strokeLinecap="round"
            strokeWidth="10"
          />
          <path
            d="M54 115h52"
            fill="none"
            stroke="#5da8ee"
            strokeLinecap="round"
            strokeWidth="4"
          />
        </svg>

        {mode === "choose" ? (
          <>
            <h1>정보보안 레벨 설정</h1>
            <span className="nickname-help">
              순위의 기본 점수는 같으며, 레벨은 추천 난이도에만 사용됩니다.
            </span>
            <div
              className="security-level-options"
              role="group"
              aria-label="정보보안 레벨 직접 선택"
            >
              {SECURITY_LEVELS.map((level) => (
                <button
                  type="button"
                  className={level === initialLevel ? "is-saved" : ""}
                  key={level}
                  disabled={submitting}
                  onClick={() => void submitLevel(level)}
                >
                  <b>{SECURITY_LEVEL_META[level].label}</b>
                  <span>{SECURITY_LEVEL_META[level].shortDescription}</span>
                </button>
              ))}
            </div>
            <button
              className="security-diagnostic-start"
              type="button"
              disabled={submitting}
              onClick={() => setMode("diagnose")}
            >
              3문항으로 레벨 진단
            </button>
          </>
        ) : (
          <>
            <div className="security-diagnostic-progress">
              <span>간단 진단</span>
              <b>
                {step + 1} / {DIAGNOSTIC_QUESTIONS.length}
              </b>
            </div>
            <h1 className="security-diagnostic-question">
              {question.question}
            </h1>
            <div className="security-diagnostic-answers">
              {question.options.map((option, index) => (
                <button
                  type="button"
                  key={option}
                  disabled={submitting}
                  onClick={() => answerDiagnostic(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  {option}
                </button>
              ))}
            </div>
            <button
              className="security-diagnostic-cancel"
              type="button"
              onClick={() => {
                setMode("choose")
                setStep(0)
                setDiagnosticScore(0)
              }}
            >
              직접 선택으로 돌아가기
            </button>
          </>
        )}
        {error && <p className="nickname-error">{error}</p>}
      </section>
    </div>
  )
}
