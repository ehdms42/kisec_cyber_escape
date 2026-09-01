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
        <img
          className="agent-badge-image"
          src="/lock-front-blue-v2.png"
          alt=""
          aria-hidden="true"
        />
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
