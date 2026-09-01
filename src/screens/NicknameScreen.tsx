import { useState } from "react"

interface NicknameScreenProps {
  initialName: string
  onConfirm: (nickname: string) => void
}

const MAX_NICKNAME_LENGTH = 12
const MIN_NICKNAME_LENGTH = 2

export default function NicknameScreen({
  initialName,
  onConfirm,
}: NicknameScreenProps) {
  const [value, setValue] = useState(initialName)
  const nickname = value.trim()
  const isValid = nickname.length >= MIN_NICKNAME_LENGTH

  return (
    <div className="app-frame nickname-screen">
      <div className="title-room" aria-hidden="true" />
      <div className="nickname-shade" aria-hidden="true" />
      <form
        className="nickname-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (!isValid) return
          onConfirm(nickname)
        }}
      >
        <img
          className="agent-badge-image"
          src="/lock-front-blue-v2.png"
          alt=""
          aria-hidden="true"
        />
        <h1>요원명을 입력하세요</h1>
        <span className="nickname-help">탈출 기록과 순위에 표시됩니다.</span>
        <label>
          <span>요원명</span>
          <input
            autoFocus
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
        <button type="submit" disabled={!isValid}>
          다음
        </button>
      </form>
    </div>
  )
}
