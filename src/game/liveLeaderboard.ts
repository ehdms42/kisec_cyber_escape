import { isAdminDemoMode, supabase } from "../lib/supabase"
import type { SecurityLevel } from "./securityLevel"

export interface LiveRankingEntry {
  rank: number
  attemptId: string
  nickname: string
  securityLevel: SecurityLevel | null
  verifiedScore: number
  answeredCount: number
  scoreReachedAt: string
  lastScoreDelta: number
  lastScoreChangedAt: string | null
  status: "in_progress" | "completed"
}

interface LiveRankingRow {
  rank: number
  attempt_id: string
  nickname: string
  security_level: SecurityLevel | null
  verified_score: number
  answered_count: number
  score_reached_at: string
  last_score_delta: number
  last_score_changed_at: string | null
  status: "in_progress" | "completed"
}

export const LEADERBOARD_LOCAL_EVENT = "cyber-quest-leaderboard-change"

export function announceLeaderboardChange() {
  window.dispatchEvent(new Event(LEADERBOARD_LOCAL_EVENT))
}

export async function getLiveLeaderboard(
  publicToken: string,
  securityLevel: SecurityLevel | null,
): Promise<LiveRankingEntry[]> {
  if (isAdminDemoMode) return []
  if (!supabase) throw new Error("실시간 순위 연결 정보가 없습니다.")

  const { data, error } = await supabase.rpc("get_live_campaign_leaderboard", {
    p_public_token: publicToken,
    p_security_level: securityLevel,
    p_limit: 100,
  })
  if (error) throw error

  return (data as LiveRankingRow[]).map((row) => ({
    rank: row.rank,
    attemptId: row.attempt_id,
    nickname: row.nickname,
    securityLevel: row.security_level,
    verifiedScore: row.verified_score,
    answeredCount: row.answered_count,
    scoreReachedAt: row.score_reached_at,
    lastScoreDelta: row.last_score_delta,
    lastScoreChangedAt: row.last_score_changed_at,
    status: row.status,
  }))
}

export function subscribeToLeaderboard(
  campaignId: string,
  onChange: () => void,
  onStatus: (connected: boolean) => void,
) {
  if (!supabase || isAdminDemoMode) {
    onStatus(false)
    return () => undefined
  }

  const client = supabase
  const channel = client
    .channel(`campaign-leaderboard-${campaignId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_leaderboard_entries",
        filter: `campaign_id=eq.${campaignId}`,
      },
      onChange,
    )
    .subscribe((status) => {
      onStatus(status === "SUBSCRIBED")
    })

  return () => {
    void client.removeChannel(channel)
  }
}
