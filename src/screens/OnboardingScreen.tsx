import { useEffect, useState } from "react"
import { PROLOGUE } from "../game/config"

interface OnboardingScreenProps {
  nickname: string
  onComplete: () => void
}

const TYPE_INTERVAL_MS = 28

export default function OnboardingScreen({
  nickname,
  onComplete,
}: OnboardingScreenProps) {
  const [dialogueIndex, setDialogueIndex] = useState(0)
  const [visibleText, setVisibleText] = useState("")
  const dialogue = PROLOGUE[dialogueIndex]
  const isLastDialogue = dialogueIndex === PROLOGUE.length - 1
  const isTyping = visibleText.length < dialogue.text.length

  useEffect(() => {
    setVisibleText("")
    let cursor = 0
    const timer = window.setInterval(() => {
      cursor += 1
      setVisibleText(dialogue.text.slice(0, cursor))
      if (cursor >= dialogue.text.length) window.clearInterval(timer)
    }, TYPE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [dialogue.text])

  const goToNextDialogue = () => {
    if (isTyping) {
      setVisibleText(dialogue.text)
      return
    }

    if (isLastDialogue) onComplete()
    else setDialogueIndex((value) => value + 1)
  }

  const roomImage =
    dialogue.scene === 0
      ? "/onboarding-awakening-v2.png"
      : dialogue.scene === 1
        ? "/onboarding-keypad-v2.png"
        : dialogue.state === "denied"
          ? "/onboarding-keypad-error-v3.png"
          : "/onboarding-keypad-v2.png"

  return (
    <div
      className={`app-frame onboarding-screen ${
        dialogue.state === "denied" ? "is-denied" : ""
      }`}
    >
      {dialogue.scene === 2 ? (
        <div className="computer-scene" aria-hidden="true">
          <img src="/onboarding-terminal-v2.png" alt="" />
          <div
            className={`terminal-display ${
              dialogue.state === "briefing" ? "briefing" : "booting"
            }`}
          >
            <div className="terminal-log-screen">
              <small>SECURE NODE // 04</small>
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <div>
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <img
          className={`onboarding-room dialogue-scene-${dialogue.scene} ${
            dialogue.state === "denied" ? "access-denied" : ""
          }`}
          src={roomImage}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="onboarding-shade" aria-hidden="true" />

      {dialogue.state === "denied" ? (
        <button
          className="denied-terminal-action"
          onClick={() => setDialogueIndex((value) => value + 1)}
          aria-label="접근 거부 확인 후 다음 장면"
        >
          <span className="denied-continue">화면을 눌러 계속</span>
        </button>
      ) : (
        <main className="dialogue-stage">
          <button
            className="dialogue-box"
            onClick={goToNextDialogue}
            aria-label={
              isTyping
                ? "대사 전체 표시"
                : isLastDialogue
                  ? "퀘스트 시작"
                  : "다음 대사"
            }
          >
            <span
              className={`speaker-tag ${
                dialogue.speaker === "보안 시스템" ? "system" : "player"
              }`}
            >
              {dialogue.speaker === "player" ? nickname : dialogue.speaker}
            </span>
            <span className="dialogue-text">
              {visibleText}
              <i className={isTyping ? "typing" : ""} />
            </span>
            {!isTyping && (
              <span className="dialogue-next">
                {isLastDialogue ? "QUEST START" : "▼"}
              </span>
            )}
          </button>
        </main>
      )}

      {dialogueIndex === 0 && (
        <div className="blink-sequence" aria-hidden="true">
          <i className="upper-lid" />
          <i className="lower-lid" />
        </div>
      )}
    </div>
  )
}
