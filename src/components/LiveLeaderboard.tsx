import { useCallback, useEffect, useRef, useState } from "react"
import {
  getLiveLeaderboard,
  LEADERBOARD_LOCAL_EVENT,
  type LiveRankingEntry,
  subscribeToLeaderboard,
} from "../game/liveLeaderboard"
import {
  SECURITY_LEVEL_META,
  SECURITY_LEVELS,
  type SecurityLevel,
} from "../game/securityLevel"

interface LiveLeaderboardProps {
  campaignId: string
  publicToken: string
  currentAttemptId: string
  currentNickname: string
  currentSecurityLevel: SecurityLevel
}

type RankingFilter = SecurityLevel | "all"

function Trophy({ rank }: { rank: number }) {
  const metal = rank === 1 ? "금색" : rank === 2 ? "은색" : "동색"
  return (
    <span
      className={`live-rank-trophy rank-${rank}`}
      role="img"
      aria-label={`${rank}위 ${metal} 트로피`}
    >
      <svg viewBox="0 0 34 34" aria-hidden="true">
        <path d="M10 5h14v7c0 5-2.8 9-7 10.4C12.8 21 10 17 10 12V5Z" />
        <path d="M10 8H5v3c0 4 2.4 6.8 6.2 7.3M24 8h5v3c0 4-2.4 6.8-6.2 7.3M17 22v5M11 30h12" />
      </svg>
    </span>
  )
}

function isRecentScore(entry: LiveRankingEntry) {
  if (!entry.lastScoreChangedAt || entry.lastScoreDelta <= 0) return false
  return Date.now() - new Date(entry.lastScoreChangedAt).getTime() < 20_000
}

export default function LiveLeaderboard({
  campaignId,
  publicToken,
  currentAttemptId,
  currentNickname,
  currentSecurityLevel,
}: LiveLeaderboardProps) {
  const [entries, setEntries] = useState<LiveRankingEntry[]>([])
  const [filter, setFilter] = useState<RankingFilter>("all")
  const [open, setOpen] = useState(false)
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  )
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [movements, setMovements] = useState<Record<string, number>>({})
  const previousRanks = useRef<Map<string, number>>(new Map())
  const refreshTimer = useRef<number | null>(null)
  const movementTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await getLiveLeaderboard(
        publicToken,
        filter === "all" ? null : filter,
      )
      const nextMovements: Record<string, number> = {}
      for (const entry of next) {
        const previous = previousRanks.current.get(entry.attemptId)
        if (previous !== undefined && previous !== entry.rank) {
          nextMovements[entry.attemptId] = previous - entry.rank
        }
      }
      previousRanks.current = new Map(
        next.map((entry) => [entry.attemptId, entry.rank]),
      )
      setEntries(next)
      setMovements(nextMovements)
      setError("")
      if (movementTimer.current !== null) {
        window.clearTimeout(movementTimer.current)
      }
      movementTimer.current = window.setTimeout(() => setMovements({}), 1800)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "순위를 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [filter, publicToken])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => void refresh(), 100)
  }, [refresh])

  useEffect(() => {
    previousRanks.current = new Map()
    setLoading(true)
    void refresh()
  }, [refresh])

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)")
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const active = desktop || open
    if (!active) {
      setConnected(false)
      return
    }
    const unsubscribe = subscribeToLeaderboard(
      campaignId,
      scheduleRefresh,
      setConnected,
    )
    window.addEventListener(LEADERBOARD_LOCAL_EVENT, scheduleRefresh)
    const poll = window.setInterval(() => void refresh(), 10_000)
    return () => {
      unsubscribe()
      window.removeEventListener(LEADERBOARD_LOCAL_EVENT, scheduleRefresh)
      window.clearInterval(poll)
      if (refreshTimer.current !== null)
        window.clearTimeout(refreshTimer.current)
      if (movementTimer.current !== null)
        window.clearTimeout(movementTimer.current)
    }
  }, [campaignId, desktop, open, refresh, scheduleRefresh])

  return (
    <>
      <button
        type="button"
        className="live-ranking-mobile-toggle"
        aria-expanded={open}
        aria-controls="live-ranking-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20v-7h4v7M10 20V8h4v12M15 20V4h4v16M3 20h18" />
        </svg>
        실시간 순위
      </button>
      {open && (
        <button
          className="live-ranking-scrim"
          type="button"
          aria-label="순위표 닫기"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="live-ranking-panel"
        className={`live-ranking-panel ${open ? "is-open" : ""}`}
        aria-label="실시간 참가자 순위"
      >
        <header className="live-ranking-heading">
          <div>
            <span
              className={`live-ranking-status ${connected ? "is-live" : ""}`}
            >
              <i aria-hidden="true" />
              {connected ? "실시간 연결" : "자동 갱신"}
            </span>
            <h2>참가자 순위</h2>
            <p>
              {currentNickname}
              <b
                className={`security-level-chip level-${currentSecurityLevel}`}
              >
                {SECURITY_LEVEL_META[currentSecurityLevel].label}
              </b>
            </p>
          </div>
          <button
            type="button"
            className="live-ranking-close"
            aria-label="순위표 닫기"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>

        <nav className="live-ranking-filters" aria-label="레벨별 순위 필터">
          <button
            type="button"
            className={filter === "all" ? "is-active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체
          </button>
          {SECURITY_LEVELS.map((level) => (
            <button
              type="button"
              key={level}
              className={filter === level ? "is-active" : ""}
              aria-pressed={filter === level}
              onClick={() => setFilter(level)}
            >
              {SECURITY_LEVEL_META[level].label}
            </button>
          ))}
        </nav>

        <div className="live-ranking-columns" aria-hidden="true">
          <span>순위 · 요원</span>
          <span>점수</span>
          <span>해결</span>
        </div>
        <div className="live-ranking-list" aria-live="polite">
          {loading && <p className="live-ranking-empty">순위 집계 중…</p>}
          {!loading && error && (
            <button
              type="button"
              className="live-ranking-empty"
              onClick={() => void refresh()}
            >
              순위를 불러오지 못했습니다. 다시 확인
            </button>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="live-ranking-empty">아직 등록된 참가자가 없습니다.</p>
          )}
          {entries.map((entry) => {
            const movement = movements[entry.attemptId] ?? 0
            const current = entry.attemptId === currentAttemptId
            return (
              <article
                key={entry.attemptId}
                className={`live-ranking-row rank-${Math.min(entry.rank, 4)} ${
                  current ? "is-current" : ""
                } ${movement ? "rank-moved" : ""}`}
              >
                <div className="live-ranking-position">
                  {entry.rank <= 3 ? (
                    <Trophy rank={entry.rank} />
                  ) : (
                    <b>{entry.rank}</b>
                  )}
                  {movement !== 0 && (
                    <span
                      className={movement > 0 ? "rank-up" : "rank-down"}
                      aria-label={`순위 ${Math.abs(movement)}단계 ${
                        movement > 0 ? "상승" : "하락"
                      }`}
                    >
                      {movement > 0 ? "↑" : "↓"}
                      {Math.abs(movement)}
                    </span>
                  )}
                </div>
                <div className="live-ranking-player">
                  <strong>
                    {entry.nickname}
                    {current && <em>나</em>}
                  </strong>
                  <span
                    className={`security-level-chip level-${entry.securityLevel}`}
                  >
                    {SECURITY_LEVEL_META[entry.securityLevel].label}
                  </span>
                </div>
                <div className="live-ranking-score">
                  <b>{entry.verifiedScore}</b>
                  {isRecentScore(entry) && (
                    <small>+{entry.lastScoreDelta}</small>
                  )}
                </div>
                <span className="live-ranking-solved">
                  {entry.answeredCount}
                </span>
              </article>
            )
          })}
        </div>
        <footer>동점이면 해당 점수에 먼저 도달한 참가자가 앞섭니다.</footer>
      </aside>
    </>
  )
}
