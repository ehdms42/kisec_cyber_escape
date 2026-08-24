import { Fragment, useEffect, useRef, useState } from "react"
import QuestionPanel from "../components/QuestionPanel"
import {
  COINS_PER_CORRECT_ANSWER,
  DOOR_CODE,
  type GamePhase,
  PUZZLES,
  type Puzzle,
  type PuzzleId,
  QUIZ_LENGTH,
  ROOM_STAGES,
} from "../game/config"
import { splitQuestion } from "../game/question"
import { QUESTIONS } from "../data/questions"

interface GameScreenProps {
  onFinish: (score: number) => void
  onExit: () => void
}

const GAME_QUESTIONS = QUESTIONS.slice(0, QUIZ_LENGTH)
const FINAL_ASSETS = ["/server-final-keypad.jpg", "/server-escape-success.jpg"]

export default function GameScreen({ onFinish, onExit }: GameScreenProps) {
  const [phase, setPhase] = useState<GamePhase>("room")
  const [completed, setCompleted] = useState<PuzzleId[]>([])
  const [activeId, setActiveId] = useState<PuzzleId | null>(null)
  const [questionStep, setQuestionStep] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [selectedHotspot, setSelectedHotspot] =
    useState<PuzzleId | "door" | null>(null)
  const [codeInput, setCodeInput] = useState<number[]>([])
  const [hasCodeError, setHasCodeError] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [focusedId, setFocusedId] = useState<PuzzleId | null>(null)
  const roomViewportRef = useRef<HTMLDivElement>(null)

  const activePuzzle = PUZZLES.find((puzzle) => puzzle.id === activeId) ?? null
  const focusedPuzzle =
    PUZZLES.find((puzzle) => puzzle.id === focusedId) ?? null
  const questionIndex = activePuzzle?.questions[questionStep] ?? 0
  const question = GAME_QUESTIONS[questionIndex]
  const questionParts = question ? splitQuestion(question.question) : null
  const answered = selectedAnswer !== null
  const level = activePuzzle
    ? PUZZLES.findIndex((puzzle) => puzzle.id === activePuzzle.id) + 1
    : Math.min(completed.length + 1, PUZZLES.length)
  const levelStart = PUZZLES.slice(0, level - 1).reduce(
    (total, puzzle) => total + puzzle.questions.length,
    0,
  )
  const levelTotal = PUZZLES[level - 1].questions.length
  const levelAnswered = Math.max(
    0,
    Math.min(levelTotal, answeredCount - levelStart),
  )
  const levelProgress = (levelAnswered / levelTotal) * 100
  const coins = score * COINS_PER_CORRECT_ANSWER

  useEffect(() => {
    const assets = [
      ...ROOM_STAGES,
      ...PUZZLES.flatMap((puzzle) => [puzzle.closeImage, puzzle.solvedImage]),
      ...FINAL_ASSETS,
    ]

    assets.forEach((src) => {
      const image = new Image()
      image.src = src
    })
  }, [])

  useEffect(() => {
    if (phase !== "room") return

    const frame = window.requestAnimationFrame(() => {
      const viewport = roomViewportRef.current
      if (viewport)
        viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2
    })

    return () => window.cancelAnimationFrame(frame)
  }, [completed.length, phase])

  const openPuzzle = (puzzle: Puzzle, index: number) => {
    setSelectedHotspot(puzzle.id)

    if (completed.includes(puzzle.id)) {
      setActiveId(puzzle.id)
      setPhase("reveal")
      return
    }

    if (index === completed.length) setFocusedId(puzzle.id)
    else setFocusedId(null)
  }

  const beginPuzzle = (puzzle: Puzzle) => {
    setFocusedId(null)
    setActiveId(puzzle.id)
    setQuestionStep(0)
    setSelectedAnswer(null)
    setPhase("quiz")
  }

  const chooseAnswer = (index: number) => {
    if (answered || !question) return

    setSelectedAnswer(index)
    setAnsweredCount((value) => value + 1)
    if (index === question.answer) setScore((value) => value + 1)
  }

  const goToNextQuestion = () => {
    if (!answered || !activePuzzle) return

    if (questionStep === activePuzzle.questions.length - 1) {
      setPhase("reveal")
      return
    }

    setQuestionStep((value) => value + 1)
    setSelectedAnswer(null)
  }

  const collectClue = () => {
    if (!activePuzzle) return

    if (!completed.includes(activePuzzle.id)) {
      setCompleted((value) => [...value, activePuzzle.id])
    }
    setFocusedId(null)
    setActiveId(null)
    setPhase("room")
  }

  const pressKey = (digit: number) => {
    if (isUnlocking) return

    setHasCodeError(false)
    setCodeInput((value) =>
      value.length < DOOR_CODE.length ? [...value, digit] : value,
    )
  }

  const submitCode = () => {
    if (codeInput.length !== DOOR_CODE.length || isUnlocking) return

    if (codeInput.every((digit, index) => digit === DOOR_CODE[index])) {
      setIsUnlocking(true)
      window.setTimeout(() => onFinish(score), 850)
      return
    }

    setHasCodeError(true)
    window.setTimeout(() => {
      setHasCodeError(false)
      setCodeInput([])
    }, 900)
  }

  return (
    <div className="app-frame escape-game-screen">
      <header className="escape-hud">
        <button
          className="hud-exit"
          onClick={onExit}
          aria-label="홈으로 돌아가기"
        >
          ←
        </button>
        <div
          className="reward-wallets"
          aria-label={`별 ${score}개, 코인 ${coins}개`}
        >
          <div className="reward-wallet stars-wallet">
            <img
              className="star-token"
              src="/header-star.svg"
              alt=""
              aria-hidden="true"
            />
            <b key={`stars-${score}`}>{score}</b>
          </div>
          <div className="reward-wallet coins-wallet">
            <img
              className="coin-token"
              src="/header-coin.svg"
              alt=""
              aria-hidden="true"
            />
            <b key={`coins-${coins}`}>{coins}</b>
          </div>
        </div>
      </header>

      <section
        className="level-sheet"
        aria-label={`레벨 ${level}, 진행도 ${levelAnswered}/${levelTotal}`}
      >
        <div className="level-sheet-heading">
          <strong>LEVEL {level}</strong>
          <small>{level} / 4</small>
        </div>
        <div className="level-track">
          <i style={{ width: `${levelProgress}%` }} />
          <b>
            {levelAnswered} / {levelTotal}
          </b>
        </div>
      </section>

      {phase === "room" && (
        <main className="room-exploration scene-enter">
          <div className="room-viewport" ref={roomViewportRef}>
            <div className="room-panorama">
              <img
                key={completed.length}
                src={ROOM_STAGES[completed.length]}
                alt="네 개의 단서 장치가 놓인 서버 금고 전경"
              />
              <div className="ceiling-light-flicker" aria-hidden="true" />
              <span className="room-scan" aria-hidden="true" />
              <div className="dust" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>

              {PUZZLES.map((puzzle, index) => {
                const state = completed.includes(puzzle.id)
                  ? "complete"
                  : index === completed.length
                    ? "available"
                    : "locked"

                return (
                  <Fragment key={puzzle.id}>
                    {state === "locked" && (
                      <span
                        className={`locked-device-veil device-${puzzle.id}`}
                        style={puzzle.outline}
                        aria-hidden="true"
                      />
                    )}
                    {selectedHotspot === puzzle.id && (
                      <svg
                        className={`device-selection-trace device-${puzzle.id}`}
                        viewBox="0 0 1600 900"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          className="device-trace-base"
                          d={puzzle.tracePath}
                        />
                        <path
                          className="device-trace-spark"
                          d={puzzle.tracePath}
                        />
                      </svg>
                    )}
                    <button
                      className={`object-hotspot ${state}`}
                      style={puzzle.hotspot}
                      onClick={() => openPuzzle(puzzle, index)}
                      aria-label={`${puzzle.title} ${
                        state === "complete"
                          ? "완료"
                          : state === "available"
                            ? `레벨 ${index + 1} 시작 가능`
                            : `레벨 ${index + 1} 잠김`
                      }`}
                    >
                      {state === "complete" && (
                        <span className="hotspot-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      {state === "available" && (
                        <span className="hotspot-beacon" aria-hidden="true">
                          <i />
                        </span>
                      )}
                      {state === "locked" && (
                        <span className="hotspot-lock-badge" aria-hidden="true">
                          <svg
                            className="hotspot-lock-symbol"
                            viewBox="0 0 32 36"
                          >
                            <path
                              className="hotspot-lock-shackle"
                              d="M8 15V10a8 8 0 0 1 16 0v5"
                            />
                            <path
                              className="hotspot-lock-body"
                              d="M5 14.5h22v18H5z"
                            />
                            <path
                              className="hotspot-lock-keyhole"
                              d="M16 20a3 3 0 0 0-1.5 5.6V29h3v-3.4A3 3 0 0 0 16 20Z"
                            />
                          </svg>
                        </span>
                      )}
                      <small>{puzzle.shortTitle}</small>
                    </button>
                  </Fragment>
                )
              })}

              <button
                className={`door-hotspot ${
                  completed.length === PUZZLES.length ? "available" : "locked"
                } ${selectedHotspot === "door" ? "touch-selected" : ""}`}
                onClick={() => {
                  setSelectedHotspot("door")
                  if (completed.length === PUZZLES.length) setPhase("keypad")
                }}
                aria-label="최종 출입문"
              >
                <span />
              </button>
            </div>
          </div>

          {completed.length === 0 && !focusedPuzzle && (
            <div className="room-pan-hint" aria-hidden="true">
              <span className="pan-direction pan-direction-left" />
              <span className="pan-hint-copy">
                <small>SECTOR SCAN</small>
                <strong>좌우로 밀어 탐색</strong>
              </span>
              <span className="pan-direction pan-direction-right" />
            </div>
          )}

          {focusedPuzzle && (
            <div
              className="level-entry-card"
              role="dialog"
              aria-label={`레벨 ${PUZZLES.findIndex((puzzle) => puzzle.id === focusedPuzzle.id) + 1} 시작 안내`}
            >
              <button
                className="level-entry-close"
                onClick={() => setFocusedId(null)}
                aria-label="안내 닫기"
              >
                ×
              </button>
              <small>탐색 지점 발견</small>
              <strong>
                LEVEL{" "}
                {PUZZLES.findIndex((puzzle) => puzzle.id === focusedPuzzle.id) +
                  1}
              </strong>
              <p>
                이 장치를 조사하면 LEVEL{" "}
                {PUZZLES.findIndex((puzzle) => puzzle.id === focusedPuzzle.id) +
                  1}{" "}
                문제를 풀 수 있어요.
              </p>
              <button
                className="level-entry-start"
                onClick={() => beginPuzzle(focusedPuzzle)}
              >
                레벨 시작
              </button>
            </div>
          )}

          {completed.length > 0 && !focusedPuzzle && (
            <div
              className={`room-code-rail ${
                completed.length === PUZZLES.length ? "ready" : ""
              }`}
              aria-label={`획득한 탈출 코드 ${completed.length}자리`}
            >
              {PUZZLES.map((puzzle) => (
                <span
                  key={puzzle.id}
                  className={completed.includes(puzzle.id) ? "found" : ""}
                >
                  {completed.includes(puzzle.id) ? puzzle.digit : "?"}
                </span>
              ))}
            </div>
          )}

          {completed.length === PUZZLES.length && (
            <button
              className="room-exit-action"
              onClick={() => setPhase("keypad")}
            >
              키패드 열기
            </button>
          )}
        </main>
      )}

      {(phase === "quiz" || phase === "reveal") && activePuzzle && (
        <main className="object-mission scene-enter">
          <div
            className={`object-visual ${phase === "reveal" ? "solved" : ""}`}
          >
            <img
              key={phase}
              src={
                phase === "reveal"
                  ? activePuzzle.solvedImage
                  : activePuzzle.closeImage
              }
              alt={`${activePuzzle.title} ${
                phase === "reveal" ? "해결 상태" : "근접 장면"
              }`}
            />
            {phase === "reveal" && completed.includes(activePuzzle.id) && (
              <button
                onClick={() => {
                  setPhase("room")
                  setActiveId(null)
                }}
                aria-label="방으로 돌아가기"
              >
                ←
              </button>
            )}
            <div>
              <small>OBJECT {completed.length + 1} / 4</small>
              <strong>{activePuzzle.title}</strong>
            </div>
          </div>

          {phase === "quiz" && question && questionParts && (
            <section className="object-quiz-panel">
              <div className="question-meta">
                <span>
                  {activePuzzle.shortTitle} {questionStep + 1}/
                  {activePuzzle.questions.length}
                </span>
                <span>{question.category}</span>
              </div>
              <QuestionPanel
                question={question}
                parts={questionParts}
                selectedAnswer={selectedAnswer}
                onSelectAnswer={chooseAnswer}
              />
              {answered && (
                <div
                  className={`mission-feedback ${
                    selectedAnswer === question.answer ? "correct" : "wrong"
                  }`}
                >
                  <strong>
                    {selectedAnswer === question.answer ? "정답" : "오답"}
                  </strong>
                  {selectedAnswer === question.answer && (
                    <span className="answer-reward">
                      <i>★ +1</i>
                      <i>$ +{COINS_PER_CORRECT_ANSWER}</i>
                    </span>
                  )}
                  <p>{question.explanation}</p>
                </div>
              )}
              <button
                className="room-primary"
                onClick={goToNextQuestion}
                disabled={!answered}
              >
                {questionStep === activePuzzle.questions.length - 1
                  ? "장치 해제"
                  : "다음 문제"}
              </button>
            </section>
          )}

          {phase === "reveal" && (
            <section className="clue-reveal">
              <small>
                {completed.includes(activePuzzle.id)
                  ? "COLLECTED CLUE"
                  : "OBJECT CLEARED"}
              </small>
              <h2>{activePuzzle.clue}</h2>
              <div className="clue-digit">
                <span>{activePuzzle.digit}</span>
                <i>
                  CODE{" "}
                  {completed.length +
                    (completed.includes(activePuzzle.id) ? 0 : 1)}{" "}
                  / 4
                </i>
              </div>
              <button className="room-primary" onClick={collectClue}>
                {completed.includes(activePuzzle.id)
                  ? "방으로 돌아가기"
                  : "숫자 획득"}
              </button>
            </section>
          )}
        </main>
      )}

      {phase === "keypad" && (
        <main
          className={`keypad-mission scene-enter ${
            hasCodeError ? "error" : ""
          } ${isUnlocking ? "unlocking" : ""}`}
        >
          <div className="keypad-visual">
            <img
              src="/server-final-keypad.jpg"
              alt="서버 금고 최종 출입문과 네 자리 키패드"
            />
            <button
              onClick={() => setPhase("room")}
              aria-label="방으로 돌아가기"
            >
              ←
            </button>
          </div>
          <section className="keypad-panel">
            <small>FINAL ACCESS</small>
            <h1>
              {isUnlocking
                ? "잠금 해제"
                : hasCodeError
                  ? "코드 불일치"
                  : "탈출 코드를 입력하세요"}
            </h1>
            <div className="keypad-display">
              {DOOR_CODE.map((_, index) => (
                <span key={index}>{codeInput[index] ?? ""}</span>
              ))}
            </div>
            <div className="number-pad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button key={digit} onClick={() => pressKey(digit)}>
                  {digit}
                </button>
              ))}
              <button
                aria-label="한 자리 지우기"
                onClick={() => setCodeInput((value) => value.slice(0, -1))}
              >
                ⌫
              </button>
              <button onClick={() => pressKey(0)}>0</button>
              <button
                className="enter-key"
                onClick={submitCode}
                disabled={codeInput.length !== DOOR_CODE.length}
              >
                OK
              </button>
            </div>
            {hasCodeError && (
              <p role="alert">
                접근이 거부되었습니다. 획득한 숫자를 다시 확인하세요.
              </p>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
