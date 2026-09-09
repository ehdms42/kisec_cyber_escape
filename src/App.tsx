import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import type { AttemptSession, PublicCampaign } from "./admin/institutionTypes"
import LiveLeaderboard from "./components/LiveLeaderboard"
import {
  EMPTY_GAME_PROGRESS,
  normalizeGameProgress,
  type GameProgress,
} from "./game/session"
import {
  isSecurityLevel,
  SECURITY_LEVEL_META,
  securityLevelFromResult,
  type SecurityLevel,
} from "./game/securityLevel"
import { QUIZ_LENGTH } from "./game/config"
import DesignSystemScreen from "./screens/DesignSystemScreen"
import DepartmentScreen from "./screens/DepartmentScreen"
import GameScreen from "./screens/GameScreen"
import NicknameScreen from "./screens/NicknameScreen"
import OnboardingScreen from "./screens/OnboardingScreen"
import ResultScreen from "./screens/ResultScreen"
import TitleScreen from "./screens/TitleScreen"

type Screen = "title" | "nickname" | "department" | "story" | "game" | "result" | "locked"

const NICKNAME_STORAGE_KEY = "cyber-quest-nickname"
const DEPARTMENT_STORAGE_KEY = "cyber-quest-department"
const PROGRESS_CACHE_PREFIX = "cyber-quest-progress"
const AdminScreen = lazy(() => import("./screens/AdminScreen"))
const CAMPAIGN_TOKEN = new URLSearchParams(window.location.search).get(
  "campaign",
)
const loadAttemptApi = () => import("./admin/institutionRepository")

function progressCacheKey(attemptId: string) {
  return `${PROGRESS_CACHE_PREFIX}:${attemptId}`
}

function readCachedProgress(session: AttemptSession) {
  const raw = window.localStorage.getItem(progressCacheKey(session.attemptId))
  if (!raw || !session.resumeToken) return null
  try {
    const cached = JSON.parse(raw) as {
      resumeToken?: unknown
      progress?: Record<string, unknown>
    }
    return cached.resumeToken === session.resumeToken
      ? (cached.progress ?? null)
      : null
  } catch {
    return null
  }
}

export default function App() {
  const showAdmin = window.location.pathname.startsWith("/admin")
  const showDesignSystem = new URLSearchParams(window.location.search).has(
    "design-system",
  )
  const [screen, setScreen] = useState<Screen>("title")
  const [nickname, setNickname] = useState(
    () => window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "",
  )
  const [department, setDepartment] = useState(
    () => window.localStorage.getItem(DEPARTMENT_STORAGE_KEY) ?? "",
  )
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel | null>(null)
  const [score, setScore] = useState(0)
  const [gameKey, setGameKey] = useState(0)
  const [hasGameSession, setHasGameSession] = useState(false)
  const [campaign, setCampaign] = useState<PublicCampaign | null>(null)
  const [campaignLoading, setCampaignLoading] = useState(
    Boolean(CAMPAIGN_TOKEN),
  )
  const [campaignError, setCampaignError] = useState("")
  const [attemptSession, setAttemptSession] = useState<AttemptSession | null>(
    null,
  )
  const [sessionWarning, setSessionWarning] = useState("")
  const latestProgress = useRef<GameProgress>(EMPTY_GAME_PROGRESS)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!CAMPAIGN_TOKEN) return
    loadAttemptApi()
      .then((api) => api.getPublicCampaign(CAMPAIGN_TOKEN))
      .then(setCampaign)
      .catch((error) =>
        setCampaignError(
          error instanceof Error
            ? error.message
            : "배포 링크를 확인하지 못했습니다.",
        ),
      )
      .finally(() => setCampaignLoading(false))
  }, [])

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!attemptSession || attemptSession.status !== "in_progress") return
    const flushProgress = () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      void loadAttemptApi()
        .then((api) =>
          api.saveAttemptProgress(attemptSession, {
            ...latestProgress.current,
          }),
        )
        .catch(() => undefined)
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushProgress()
    }
    window.addEventListener("pagehide", flushProgress)
    document.addEventListener("visibilitychange", flushWhenHidden)
    return () => {
      window.removeEventListener("pagehide", flushProgress)
      document.removeEventListener("visibilitychange", flushWhenHidden)
    }
  }, [attemptSession])

  const startGame = () => {
    setGameKey((value) => value + 1)
    setHasGameSession(true)
    setScreen("game")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const finishGame = async (finalScore: number) => {
    let resultScore = finalScore
    let resultSecurityLevel = securityLevelFromResult(finalScore, QUIZ_LENGTH)
    if (attemptSession) {
      let result
      try {
        const { completeAttempt } = await loadAttemptApi()
        result = await completeAttempt(attemptSession, {
          ...latestProgress.current,
          score: finalScore,
          phase: "keypad",
        })
      } catch (error) {
        setSessionWarning(
          error instanceof Error
            ? `완료 기록 검증 실패: ${error.message}`
            : "완료 기록을 검증하지 못했습니다.",
        )
        throw error
      }
      resultScore = result?.verified_score ?? finalScore
      resultSecurityLevel = isSecurityLevel(result?.security_level)
        ? result.security_level
        : securityLevelFromResult(
            resultScore,
            result?.answered_count ?? attemptSession.requiredQuestionCount,
          )
      window.localStorage.removeItem(progressCacheKey(attemptSession.attemptId))
      setAttemptSession((current) =>
        current
          ? {
              ...current,
              status: "completed",
              verifiedScore: resultScore,
              securityLevel: resultSecurityLevel,
              completedAt: new Date().toISOString(),
              resumeToken: null,
            }
          : null,
      )
    }
    setScore(resultScore)
    setSecurityLevel(resultSecurityLevel)
    setScreen("result")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const confirmNickname = (name: string) => {
    setNickname(name)
    setSecurityLevel(null)
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, name)
    setScreen("department")
  }

  const confirmDepartment = async (
    departmentName: string,
    participantCode: string,
  ) => {
    setDepartment(departmentName)
    window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, departmentName)
    if (CAMPAIGN_TOKEN) {
      const { startOrResumeAttempt } = await loadAttemptApi()
      const session = await startOrResumeAttempt(
        CAMPAIGN_TOKEN,
        participantCode,
        nickname,
        departmentName,
      )
      setAttemptSession(session)
      setSecurityLevel(session.securityLevel)
      if (session.status !== "in_progress") {
        setScore(session.verifiedScore)
        setScreen("locked")
        return
      }
      const cachedProgress = readCachedProgress(session)
      latestProgress.current = {
        ...normalizeGameProgress(cachedProgress ?? session.state),
        score: session.verifiedScore,
        answeredCount: session.answeredCount,
      }
      if (session.answeredCount > 0) {
        setGameKey((value) => value + 1)
        setHasGameSession(true)
        setScreen("game")
        return
      }
    }
    setScreen("story")
  }

  const goHome = () => {
    setHasGameSession(false)
    setScreen("title")
  }

  const goBackFromGame = () => {
    setHasGameSession(false)
    setScreen("story")
  }

  const goBackFromResult = () => {
    if (attemptSession) {
      setScreen("locked")
      return
    }
    setScreen("game")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const persistProgress = useCallback(
    (progress: GameProgress) => {
      latestProgress.current = progress
      if (!attemptSession || attemptSession.status !== "in_progress") return
      window.localStorage.setItem(
        progressCacheKey(attemptSession.attemptId),
        JSON.stringify({
          resumeToken: attemptSession.resumeToken,
          progress,
        }),
      )
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        loadAttemptApi()
          .then((api) =>
            api.saveAttemptProgress(attemptSession, { ...progress }),
          )
          .catch((error) => {
            setSessionWarning(
              error instanceof Error
                ? `진행 상황 저장 실패: ${error.message}`
                : "진행 상황을 저장하지 못했습니다.",
            )
          })
      }, 450)
    },
    [attemptSession],
  )

  const persistAnswer = useCallback(
    async (questionOrdinal: number, selectedAnswer: number) => {
      if (!attemptSession) {
        throw new Error("응시 정보를 찾을 수 없습니다.")
      }
      try {
        const api = await loadAttemptApi()
        const result = await api.recordAttemptAnswer(
          attemptSession,
          questionOrdinal,
          selectedAnswer,
        )
        setAttemptSession((current) =>
          current
            ? {
                ...current,
                verifiedScore: result.verifiedScore,
                answeredCount: result.answeredCount,
              }
            : null,
        )
        return result
      } catch (error) {
        setSessionWarning(
          error instanceof Error
            ? `답안 검증 실패: ${error.message}`
            : "답안을 서버에 기록하지 못했습니다.",
        )
        throw error
      }
    },
    [attemptSession],
  )

  const page = {
    title: <TitleScreen onStart={() => setScreen("nickname")} />,
    nickname: (
      <NicknameScreen initialName={nickname} onConfirm={confirmNickname} />
    ),
    department: (
      <DepartmentScreen
        initialDepartment={department}
        campaignName={campaign?.institutionName}
        onConfirm={confirmDepartment}
      />
    ),
    story: <OnboardingScreen nickname={nickname} onComplete={startGame} />,
    game: null,
    result: (
      <ResultScreen
        score={score}
        securityLevel={securityLevel}
        onBack={goBackFromResult}
        onHome={goHome}
      />
    ),
    locked: (
      <div className="app-frame attempt-locked-screen">
        <section>
          <img src="/lock-front-blue-v2.png" alt="" aria-hidden="true" />
          <small>응시 기록 확인</small>
          <h1>
            {attemptSession?.status === "voided"
              ? "응시가 중지된 기록입니다"
              : "이미 완료한 퀘스트입니다"}
          </h1>
          <p>
            {attemptSession?.institutionName ?? campaign?.institutionName} 배포
            기록은 한 번만 완료할 수 있습니다. 기록 수정이 필요하면 담당자에게
            문의해 주세요.
          </p>
          <strong>최종 점수 {score} / 30</strong>
          {securityLevel && (
            <strong>
              정보보안 등급 {SECURITY_LEVEL_META[securityLevel].label}
            </strong>
          )}
          <a href="/">확인</a>
        </section>
      </div>
    ),
  }[screen]

  if (showAdmin) {
    return (
      <Suspense
        fallback={<div className="admin-loading">관리자 화면 준비 중…</div>}
      >
        <AdminScreen />
      </Suspense>
    )
  }

  if (campaignLoading) {
    return (
      <div className="campaign-loading">
        기관 배포 정보를 확인하고 있습니다…
      </div>
    )
  }

  if (CAMPAIGN_TOKEN && campaignError) {
    return (
      <div className="app-frame attempt-locked-screen">
        <section>
          <small>배포 링크 확인</small>
          <h1>참여할 수 없는 링크입니다</h1>
          <p>{campaignError}</p>
        </section>
      </div>
    )
  }

  if (showDesignSystem) {
    return (
      <div className="app-shell screen-design-system">
        <DesignSystemScreen />
      </div>
    )
  }

  const showLiveLeaderboard = Boolean(
    attemptSession && campaign && CAMPAIGN_TOKEN,
  )

  return (
    <div
      className={`app-shell screen-${screen} ${
        showLiveLeaderboard ? "has-live-leaderboard" : ""
      }`}
    >
      {hasGameSession && (
        <div className="game-live-layout" hidden={screen !== "game"}>
          <div className="game-session">
            <GameScreen
              key={gameKey}
              onFinish={finishGame}
              onExit={goBackFromGame}
              initialProgress={
                attemptSession ? { ...latestProgress.current } : null
              }
              onProgress={attemptSession ? persistProgress : undefined}
              onAnswer={attemptSession ? persistAnswer : undefined}
            />
          </div>
          {attemptSession && campaign && CAMPAIGN_TOKEN && (
            <LiveLeaderboard
              campaignId={campaign.campaignId}
              publicToken={CAMPAIGN_TOKEN}
              currentAttemptId={attemptSession.attemptId}
              currentNickname={attemptSession.nickname}
              currentSecurityLevel={attemptSession.securityLevel}
            />
          )}
        </div>
      )}
      {sessionWarning && (
        <button
          className="session-sync-warning"
          type="button"
          onClick={() => setSessionWarning("")}
        >
          {sessionWarning}
        </button>
      )}
      {screen !== "game" && page}
      {(screen === "title" || screen === "result") && (
        <footer className="site-copyright">
          Copyright © KISEC. All rights reserved.
        </footer>
      )}
    </div>
  )
}
