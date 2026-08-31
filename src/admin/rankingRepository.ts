import { isAdminDemoMode, supabase } from "../lib/supabase"
import { listAttempts } from "./institutionRepository"
import type { PrizeAward, PrizeStatus, RankingEntry } from "./rankingTypes"

const DEMO_PRIZE_KEY = "cyber-quest-demo-prize-awards"

interface RankingRpcRow {
  rank: number
  attempt_id: string
  campaign_id: string
  campaign_title: string
  institution_name: string
  nickname: string
  verified_score: number
  answered_count: number
  elapsed_seconds: number
  started_at: string
  completed_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.")
  return supabase
}

function readDemoPrizes() {
  const stored = window.localStorage.getItem(DEMO_PRIZE_KEY)
  if (!stored) return [] as PrizeAward[]
  try {
    return JSON.parse(stored) as PrizeAward[]
  } catch {
    return [] as PrizeAward[]
  }
}

function writeDemoPrizes(awards: PrizeAward[]) {
  window.localStorage.setItem(DEMO_PRIZE_KEY, JSON.stringify(awards))
}

export async function listRankings(
  campaignId?: string,
): Promise<RankingEntry[]> {
  if (isAdminDemoMode) {
    const attempts = (await listAttempts()).filter(
      (attempt) =>
        attempt.status === "completed" &&
        attempt.completedAt &&
        (!campaignId || attempt.campaignId === campaignId),
    )
    const campaigns = new Map<string, typeof attempts>()
    for (const attempt of attempts) {
      const entries = campaigns.get(attempt.campaignId) ?? []
      entries.push(attempt)
      campaigns.set(attempt.campaignId, entries)
    }

    return [...campaigns.values()].flatMap((entries) =>
      entries
        .sort((a, b) => {
          if (b.verifiedScore !== a.verifiedScore)
            return b.verifiedScore - a.verifiedScore
          const aElapsed =
            new Date(a.completedAt!).getTime() - new Date(a.startedAt).getTime()
          const bElapsed =
            new Date(b.completedAt!).getTime() - new Date(b.startedAt).getTime()
          if (aElapsed !== bElapsed) return aElapsed - bElapsed
          return (
            new Date(a.completedAt!).getTime() -
            new Date(b.completedAt!).getTime()
          )
        })
        .map<RankingEntry>((attempt, index) => ({
          rank: index + 1,
          attemptId: attempt.id,
          campaignId: attempt.campaignId,
          campaignTitle: attempt.campaignTitle,
          institutionName: attempt.institutionName,
          nickname: attempt.nickname,
          verifiedScore: attempt.verifiedScore,
          answeredCount: attempt.answeredCount,
          elapsedSeconds: Math.max(
            0,
            Math.floor(
              (new Date(attempt.completedAt!).getTime() -
                new Date(attempt.startedAt).getTime()) /
                1000,
            ),
          ),
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt!,
        })),
    )
  }

  const { data, error } = await requireSupabase().rpc("admin_get_rankings", {
    p_campaign_id: campaignId ?? null,
  })
  if (error) throw error
  return (data as RankingRpcRow[]).map((row) => ({
    rank: Number(row.rank),
    attemptId: row.attempt_id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    institutionName: row.institution_name,
    nickname: row.nickname,
    verifiedScore: row.verified_score,
    answeredCount: row.answered_count,
    elapsedSeconds: row.elapsed_seconds,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }))
}

export async function listPrizeAwards(): Promise<PrizeAward[]> {
  if (isAdminDemoMode) return readDemoPrizes()
  const { data, error } = await requireSupabase()
    .from("prize_awards")
    .select(
      "id, campaign_id, attempt_id, status, note, selected_at, delivered_at, campaigns(title, institutions(name)), game_attempts(participants(nickname))",
    )
    .order("selected_at", { ascending: false })
  if (error) throw error
  return data.map((row) => {
    const campaign = row.campaigns as unknown as {
      title: string
      institutions: { name: string } | null
    } | null
    const attempt = row.game_attempts as unknown as {
      participants: { nickname: string } | null
    } | null
    return {
      id: row.id,
      campaignId: row.campaign_id,
      campaignTitle: campaign?.title ?? "배포 종료",
      institutionName: campaign?.institutions?.name ?? "알 수 없는 기관",
      attemptId: row.attempt_id,
      nickname: attempt?.participants?.nickname ?? "알 수 없음",
      status: row.status as PrizeStatus,
      note: row.note,
      selectedAt: row.selected_at,
      deliveredAt: row.delivered_at,
    }
  })
}

export async function selectCampaignWinner(
  campaignId: string,
): Promise<PrizeAward | null> {
  if (isAdminDemoMode) {
    const winner = (await listRankings(campaignId))[0]
    if (!winner)
      throw new Error("완료한 참여자가 없어 1위를 선정할 수 없습니다.")
    const awards = readDemoPrizes()
    const existing = awards.find((award) => award.campaignId === campaignId)
    const award: PrizeAward = {
      id: existing?.id ?? crypto.randomUUID(),
      campaignId,
      campaignTitle: winner.campaignTitle,
      institutionName: winner.institutionName,
      attemptId: winner.attemptId,
      nickname: winner.nickname,
      status: "selected",
      note: existing?.note ?? "",
      selectedAt: new Date().toISOString(),
      deliveredAt: null,
    }
    writeDemoPrizes([
      award,
      ...awards.filter((item) => item.campaignId !== campaignId),
    ])
    return award
  }

  const { error } = await requireSupabase().rpc("select_campaign_winner", {
    p_campaign_id: campaignId,
  })
  if (error) throw error
  return (
    (await listPrizeAwards()).find(
      (award) => award.campaignId === campaignId,
    ) ?? null
  )
}

export async function updatePrizeAward(
  campaignId: string,
  status: PrizeStatus,
  note: string,
) {
  if (isAdminDemoMode) {
    writeDemoPrizes(
      readDemoPrizes().map((award) =>
        award.campaignId === campaignId
          ? {
              ...award,
              status,
              note,
              deliveredAt:
                status === "delivered" ? new Date().toISOString() : null,
            }
          : award,
      ),
    )
    return
  }

  const { error } = await requireSupabase().rpc("update_prize_award", {
    p_campaign_id: campaignId,
    p_status: status,
    p_note: note,
  })
  if (error) throw error
}
