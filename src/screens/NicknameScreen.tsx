import { useState } from "react"

interface NicknameScreenProps {
  initialName: string
  campaignName?: string
  onConfirm: (nickname: string, participantCode: string) => void | Promise<void>
}

const MAX_NICKNAME_LENGTH = 12
const MIN_NICKNAME_LENGTH = 2

export default function NicknameScreen({
  initialName,
  campaignName,
  onConfirm,
}: NicknameScreenProps) {
  const [value, setValue] = useState(initialName)
  const [participantCode, setParticipantCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const nickname = value.trim()
  const isValid =
    nickname.length >= MIN_NICKNAME_LENGTH &&
    (!campaignName || participantCode.trim().length >= 4)

  return (
    <div className="app-frame nickname-screen">
      <div className="title-room" aria-hidden="true" />
      <div className="nickname-shade" aria-hidden="true" />
      <form
        className="nickname-card"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!isValid || submitting) return
          setSubmitting(true)
          setError("")
          try {
            await onConfirm(nickname, participantCode.trim())
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
        <h1>
          {campaignName ? "참여 정보를 확인하세요" : "요원명을 입력하세요"}
        </h1>
        <span className="nickname-help">
          {campaignName ?? "탈출 기록과 추후 랭킹에 표시됩니다."}
        </span>
        {campaignName && (
          <label>
            <span>참여 코드</span>
            <input
              autoFocus
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
        <label>
          <span>닉네임</span>
          <input
            autoFocus={!campaignName}
            value={value}
            onChange={(event) =>
              setValue(event.target.value.slice(0, MAX_NICKNAME_LENGTH))
            }
            placeholder="2~12자 입력"
            minLength={MIN_NICKNAME_LENGTH}
            maxLength={MAX_NICKNAME_LENGTH}
            autoComplete="nickname"
          />
          <b>
            {value.length}/{MAX_NICKNAME_LENGTH}
          </b>
        </label>
        {error && <p className="nickname-error">{error}</p>}
        <button type="submit" disabled={!isValid || submitting}>
          {submitting ? "응시 기록 확인 중…" : "확인"}
        </button>
      </form>
    </div>
  )
}
