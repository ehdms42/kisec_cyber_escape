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
import {
  EMPTY_GAME_PROGRESS,
  normalizeGameProgress,
  type GameProgress,
} from "../game/session"
import type { Question } from "../data/questions"

interface GameScreenProps {
  onFinish: (score: number) => void | Promise<void>
  onExit: () => void
  initialProgress?: Record<string, unknown> | null
  onProgress?: (progress: GameProgress) => void
  onAnswer?: (
    questionOrdinal: number,
    selectedAnswer: number,
  ) => boolean | Promise<boolean>
}

const FINAL_ASSETS = ["/server-final-keypad.jpg", "/server-escape-success.jpg"]

export default function GameScreen({
  onFinish,
  onExit,
  initialProgress,
  onProgress,
  onAnswer,
}: GameScreenProps) {
  const initial = useRef(
    initialProgress
      ? normalizeGameProgress(initialProgress)
      : EMPTY_GAME_PROGRESS,
  ).current
  const [phase, setPhase] = useState<GamePhase>(initial.phase)
  const [completed, setCompleted] = useState<PuzzleId[]>(initial.completed)
  const [activeId, setActiveId] = useState<PuzzleId | null>(initial.activeId)
  const [questionStep, setQuestionStep] = useState(initial.questionStep)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(
    initial.selectedAnswer,
  )
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(
    initial.answerCorrect,
  )
  const [answerPending, setAnswerPending] = useState(false)
  const [answerSubmitError, setAnswerSubmitError] = useState("")
  const [score, setScore] = useState(initial.score)
  const [answeredCount, setAnsweredCount] = useState(initial.answeredCount)
  const [levelScoreStart, setLevelScoreStart] = useState(
    initial.levelScoreStart,
  )
  const [levelAnsweredStart, setLevelAnsweredStart] = useState(
    initial.levelAnsweredStart,
  )
  const [selectedHotspot, setSelectedHotspot] =
    useState<PuzzleId | "door" | null>(initial.selectedHotspot)
  const [codeInput, setCodeInput] = useState<number[]>(initial.codeInput)
  const [hasCodeError, setHasCodeError] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [focusedId, setFocusedId] = useState<PuzzleId | null>(initial.focusedId)
  const [gameQuestions, setGameQuestions] = useState<Question[]>([])
  const [questionLoadError, setQuestionLoadError] = useState("")
  const [questionLoadKey, setQuestionLoadKey] = useState(0)
  const roomViewportRef = useRef<HTMLDivElement>(null)
  const completionTimerRef = useRef<number | null>(null)
  const answerRequestRef = useRef(0)

  const activePuzzle = PUZZLES.find((puzzle) => puzzle.id === activeId) ?? null
  const focusedPuzzle =
    PUZZLES.find((puzzle) => puzzle.id === focusedId) ?? null
  const focusedLevel = focusedPuzzle
    ? PUZZLES.findIndex((puzzle) => puzzle.id === focusedPuzzle.id) + 1
    : null
  const questionIndex = activePuzzle?.questions[questionStep] ?? 0
  const question = gameQuestions[questionIndex]
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

  useEffect(
    () => () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    setQuestionLoadError("")
    import("../data/questionProvider")
      .then(({ loadGameQuestions }) => loadGameQuestions(Boolean(onAnswer)))
      .then((questions) => {
        if (!cancelled) setGameQuestions(questions)
      })
      .catch((error) => {
        if (!cancelled) {
          setGameQuestions([])
          setQuestionLoadError(
            error instanceof Error
              ? error.message
              : "문제를 불러오지 못했습니다.",
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [onAnswer, questionLoadKey])

  useEffect(() => {
    if (phase !== "room") return

    const frame = window.requestAnimationFrame(() => {
      const viewport = roomViewportRef.current
      if (viewport)
        viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2
    })

    return () => window.cancelAnimationFrame(frame)
  }, [completed.length, phase])

  useEffect(() => {
    onProgress?.({
      phase,
      completed,
      activeId,
      questionStep,
      selectedAnswer,
      answerCorrect,
      score,
      answeredCount,
      levelScoreStart,
      levelAnsweredStart,
      selectedHotspot,
      codeInput,
      focusedId,
    })
  }, [
    activeId,
    answeredCount,
    codeInput,
    completed,
    focusedId,
    levelAnsweredStart,
    levelScoreStart,
    onProgress,
    phase,
    questionStep,
    score,
    selectedAnswer,
    answerCorrect,
    selectedHotspot,
  ])

  const openPuzzle = (puzzle: Puzzle, index: number) => {
    if (gameQuestions.length !== QUIZ_LENGTH) return
    setSelectedHotspot(puzzle.id)
    setFocusedId(null)

    if (completed.includes(puzzle.id)) return

    if (index === completed.length) setFocusedId(puzzle.id)
    else setFocusedId(null)
  }

  const beginPuzzle = (puzzle: Puzzle) => {
    setFocusedId(null)
    setLevelScoreStart(score)
    setLevelAnsweredStart(answeredCount)
    setActiveId(puzzle.id)
    setQuestionStep(0)
    setSelectedAnswer(null)
    setAnswerCorrect(null)
    setAnswerSubmitError("")
    setPhase("quiz")
  }

  const chooseAnswer = async (index: number) => {
    if (answered || answerPending || !question) return

    const request = ++answerRequestRef.current
    setAnswerPending(true)
    setAnswerSubmitError("")
    try {
      const correct = onAnswer
        ? await onAnswer(question.id, index)
        : (await import("../data/questionAnswers")).isFallbackAnswerCorrect(
            question.id,
            index,
          )
      if (answerRequestRef.current !== request) return
      setSelectedAnswer(index)
      setAnswerCorrect(correct)
      setAnsweredCount((value) => value + 1)
      if (correct) setScore((value) => value + 1)
    } catch (error) {
      if (answerRequestRef.current !== request) return
      setAnswerSubmitError(
        error instanceof Error
          ? error.message
          : "답안을 확인하지 못했습니다. 다시 선택해 주세요.",
      )
    } finally {
      if (answerRequestRef.current === request) setAnswerPending(false)
    }
  }

  const goToNextQuestion = () => {
    if (!answered || !activePuzzle) return

    if (questionStep === activePuzzle.questions.length - 1) {
      setPhase("reveal")
      return
    }

    setQuestionStep((value) => value + 1)
    setSelectedAnswer(null)
    setAnswerCorrect(null)
    setAnswerSubmitError("")
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
      const timer = window.setTimeout(() => {
        if (completionTimerRef.current !== timer) return
        completionTimerRef.current = null
        Promise.resolve(onFinish(score)).catch(() => {
          setIsUnlocking(false)
          setHasCodeError(true)
        })
      }, 850)
      completionTimerRef.current = timer
      return
    }

    setHasCodeError(true)
    window.setTimeout(() => {
      setHasCodeError(false)
      setCodeInput([])
    }, 900)
  }

  const goBack = () => {
    if (focusedPuzzle) {
      setFocusedId(null)
      setSelectedHotspot(null)
      return
    }

    if (phase === "keypad") {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
      setIsUnlocking(false)
      setPhase("room")
      return
    }

    if ((phase === "quiz" || phase === "reveal") && activePuzzle) {
      answerRequestRef.current += 1
      setAnswerPending(false)
      if (!completed.includes(activePuzzle.id)) {
        setScore(levelScoreStart)
        setAnsweredCount(levelAnsweredStart)
        setFocusedId(activePuzzle.id)
      }
      setQuestionStep(0)
      setSelectedAnswer(null)
      setAnswerCorrect(null)
      setAnswerSubmitError("")
      setActiveId(null)
      setPhase("room")
      return
    }

    onExit()
  }

  return (
    <div className="app-frame escape-game-screen">
      <header className="escape-hud">
        <button
          className="hud-exit"
          onClick={goBack}
          aria-label="이전 화면으로 돌아가기"
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

      {gameQuestions.length !== QUIZ_LENGTH && (
        <div className="game-question-gate" role="status" aria-live="polite">
          <section>
            <img src="/lock-front-blue-v2.png" alt="" aria-hidden="true" />
            <strong>
              {questionLoadError
                ? "문제를 준비하지 못했습니다"
                : "문제 확인 중…"}
            </strong>
            {questionLoadError && <p>{questionLoadError}</p>}
            {questionLoadError && (
              <button
                type="button"
                onClick={() => setQuestionLoadKey((value) => value + 1)}
              >
                다시 확인
              </button>
            )}
          </section>
        </div>
      )}

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
                src={ROOM_STAGES[0]}
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
                        <span
                          className="hotspot-complete-badge"
                          aria-hidden="true"
                        >
                          <svg
                            className="hotspot-complete-symbol"
                            viewBox="0 0 32 36"
                          >
                            <path d="m8 18 5.5 5.5L24 12" />
                          </svg>
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
              />
            </div>
          </div>

          {completed.length === 0 && !focusedPuzzle && (
            <div className="room-pan-hint" aria-hidden="true">
              <span className="swipe-gesture">
                <i className="swipe-track" />
                <svg
                  className="swipe-hand"
                  viewBox="0 0 32 32"
                  aria-hidden="true"
                >
                  <path d="M12.4 15.8V7.4a2.1 2.1 0 0 1 4.2 0v5.3-1.1a2 2 0 0 1 4 0v2-1a2 2 0 0 1 4 0v7.2c0 4.7-3.1 7.8-7.7 7.8h-1.5c-2.8 0-5-1.2-6.5-3.5l-3-4.5a2 2 0 0 1 3.2-2.4l3.3 3.7Z" />
                </svg>
              </span>
              <span className="pan-hint-copy">
                <strong>좌우로 둘러보기</strong>
                <small>화면을 밀어 방 안을 탐색하세요</small>
              </span>
            </div>
          )}

          {focusedPuzzle && (
            <div
              className="level-entry-card"
              role="dialog"
              aria-label={`레벨 ${focusedLevel} 시작 안내`}
            >
              <button
                className="level-entry-close"
                onClick={() => setFocusedId(null)}
                aria-label="안내 닫기"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" />
                </svg>
              </button>
              <div className="level-entry-heading">
                <span className="level-entry-title">
                  <strong>{focusedPuzzle.title}</strong>
                </span>
              </div>
              <p>
                장치를 조사하고 보안 문제를 해결해 탈출 코드 단서를 획득하세요.
              </p>
              <button
                className="level-entry-start"
                onClick={() => beginPuzzle(focusedPuzzle)}
              >
                <span>조사 시작</span>
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
              <strong>{activePuzzle.title}</strong>
            </div>
          </div>

          {phase === "quiz" && question && questionParts && (
            <section className="object-quiz-panel">
              <div className="question-progress">
                <b>
                  문항 {questionStep + 1} / {activePuzzle.questions.length}
                </b>
              </div>
              <QuestionPanel
                question={question}
                parts={questionParts}
                selectedAnswer={selectedAnswer}
                answerCorrect={answerCorrect}
                answerPending={answerPending}
                onSelectAnswer={chooseAnswer}
              />
              {answerSubmitError && (
                <p className="admin-form-error" role="alert">
                  {answerSubmitError}
                </p>
              )}
              {answered && (
                <div
                  className={`mission-feedback ${
                    answerCorrect ? "correct" : "wrong"
                  }`}
                >
                  <strong>{answerCorrect ? "정답" : "오답"}</strong>
                  {answerCorrect && (
                    <span className="answer-reward">
                      <i>
                        <img src="/header-star.svg" alt="" aria-hidden="true" />
                        +1
                      </i>
                      <i>
                        <img src="/header-coin.svg" alt="" aria-hidden="true" />
                        +{COINS_PER_CORRECT_ANSWER}
                      </i>
                    </span>
                  )}
                  <p>{question.explanation}</p>
                </div>
              )}
              <button
                className="room-primary"
                onClick={goToNextQuestion}
                disabled={!answered || answerPending}
              >
                {questionStep === activePuzzle.questions.length - 1
                  ? "장치 해제"
                  : "다음 문제"}
              </button>
            </section>
          )}

          {phase === "reveal" && (
            <section className="clue-reveal">
              <h2>{activePuzzle.clue}</h2>
              <div className="clue-digit">
                <span>{activePuzzle.digit}</span>
                <i>
                  탈출 코드{" "}
                  {completed.length +
                    (completed.includes(activePuzzle.id) ? 0 : 1)}{" "}
                  / 4
                </i>
              </div>
              <button className="room-primary" onClick={collectClue}>
                {completed.includes(activePuzzle.id)
                  ? "방으로 돌아가기"
                  : "코드 획득"}
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
