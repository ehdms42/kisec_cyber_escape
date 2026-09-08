import { useState } from "react"

interface DepartmentScreenProps {
  initialDepartment: string
  campaignName?: string
  onConfirm: (
    department: string,
    participantCode: string,
  ) => void | Promise<void>
}

const MAX_DEPARTMENT_LENGTH = 30
const MIN_DEPARTMENT_LENGTH = 2

export default function DepartmentScreen({
  initialDepartment,
  campaignName,
  onConfirm,
}: DepartmentScreenProps) {
  const [value, setValue] = useState(initialDepartment)
  const [participantCode, setParticipantCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const department = value.trim()
  const isValid =
    department.length >= MIN_DEPARTMENT_LENGTH &&
    (!campaignName || participantCode.trim().length >= 4)

  return (
    <div className="app-frame nickname-screen department-screen">
      <div className="title-room" aria-hidden="true" />
      <div className="nickname-shade" aria-hidden="true" />
      <form
        className="nickname-card department-card"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!isValid || submitting) return
          setSubmitting(true)
          setError("")
          try {
            await onConfirm(department, participantCode.trim())
          } catch (submitError) {
            setError(
              submitError instanceof Error
                ? submitError.message
                : "참여 정보를 확인하지 못했습니다.",
            )
            setSubmitting(false)
          }
        }}
      >
        <svg
          className="agent-badge-image department-badge-image"
          viewBox="0 0 160 160"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="department-frame"
              x1="32"
              y1="25"
              x2="128"
              y2="137"
            >
              <stop offset="0" stopColor="#c6efff" />
              <stop offset="0.2" stopColor="#3197f2" />
              <stop offset="0.56" stopColor="#0754c7" />
              <stop offset="1" stopColor="#031f5c" />
            </linearGradient>
            <linearGradient
              id="department-face"
              x1="50"
              y1="43"
              x2="112"
              y2="127"
            >
              <stop offset="0" stopColor="#176bce" />
              <stop offset="0.48" stopColor="#0a3e91" />
              <stop offset="1" stopColor="#03183d" />
            </linearGradient>
            <linearGradient
              id="department-mark"
              x1="80"
              y1="53"
              x2="80"
              y2="113"
            >
              <stop offset="0" stopColor="#f5fcff" />
              <stop offset="1" stopColor="#8ed8ff" />
            </linearGradient>
          </defs>
          <path
            d="M39 21h82l18 18v82l-18 18H39l-18-18V39z"
            fill="#020e28"
            opacity=".86"
            transform="translate(0 5)"
          />
          <path
            d="M39 17h82l18 18v82l-18 18H39l-18-18V35z"
            fill="url(#department-frame)"
            stroke="#8ed9ff"
            strokeWidth="3"
          />
          <path
            d="M43 27h74l12 12v74l-12 12H43l-12-12V39z"
            fill="url(#department-face)"
            stroke="#021b4c"
            strokeWidth="3"
          />
          <path
            d="M45 32h70l8 8"
            fill="none"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeWidth="3"
            opacity=".55"
          />
          <path
            d="M47 76 80 54l33 22M54 78h52v33H54zM48 112h64"
            fill="none"
            stroke="url(#department-mark)"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeWidth="6"
          />
          <path
            d="M67 80v29M80 80v29M93 80v29"
            fill="none"
            stroke="#c6efff"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <circle cx="80" cy="43" r="3" fill="#d6f5ff" opacity=".9" />
        </svg>
        <h1>부서명을 입력하세요</h1>
        <span className="nickname-help">
          {campaignName
            ? `${campaignName} 참여 정보를 확인합니다.`
            : "소속 정보는 탈출 기록과 함께 저장됩니다."}
        </span>
        <label>
          <span>부서명</span>
          <input
            autoFocus
            value={value}
            onChange={(event) =>
              setValue(event.target.value.slice(0, MAX_DEPARTMENT_LENGTH))
            }
            placeholder="소속 부서 입력"
            minLength={MIN_DEPARTMENT_LENGTH}
            maxLength={MAX_DEPARTMENT_LENGTH}
            autoComplete="organization-title"
          />
          <b>
            {value.length}/{MAX_DEPARTMENT_LENGTH}
          </b>
        </label>
        {campaignName && (
          <label>
            <span>참여 코드</span>
            <input
              value={participantCode}
              onChange={(event) =>
                setParticipantCode(event.target.value.slice(0, 40))
              }
              placeholder="기관에서 안내받은 코드"
              minLength={4}
              maxLength={40}
              autoComplete="off"
            />
          </label>
        )}
        {error && <p className="nickname-error">{error}</p>}
        <button type="submit" disabled={!isValid || submitting}>
          {submitting ? "응시 기록 확인 중…" : "확인"}
        </button>
      </form>
    </div>
  )
}
