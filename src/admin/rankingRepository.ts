import { isAdminDemoMode } from "../lib/supabase"
import { listAttempts } from "./institutionRepository"
import type { PrizeAward, PrizeStatus, RankingEntry } from "./rankingTypes"
import { adminRequest } from "./serverApi"

const DEMO_PRIZE_KEY = "cyber-quest-demo-prize-awards"

function isPrizeAward(value: unknown): value is PrizeAward {
  if (!value || typeof value !== "object") return false
  const award = value as Record<string, unknown>
  return (
    typeof award.id === "string" &&
    typeof award.campaignId === "string" &&
    typeof award.campaignTitle === "string" &&
    typeof award.institutionName === "string" &&
    typeof award.attemptId === "string" &&
    typeof award.nickname === "string" &&
    typeof award.department === "string" &&
    ["selected", "notified", "delivered"].includes(String(award.status)) &&
    typeof award.note === "string" &&
    typeof award.selectedAt === "string" &&
    (typeof award.deliveredAt === "string" || award.deliveredAt === null)
  )
}

function readDemoPrizes(): PrizeAward[] {
  const stored = window.localStorage.getItem(DEMO_PRIZE_KEY)
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) && parsed.every(isPrizeAward) ? parsed : []
  } catch {
    return []
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
          department: attempt.department,
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

  const query = campaignId
    ? `?campaignId=${encodeURIComponent(campaignId)}`
    : ""
  return adminRequest<RankingEntry[]>(`/rankings${query}`)
}

export async function listPrizeAwards(): Promise<PrizeAward[]> {
  if (isAdminDemoMode) return readDemoPrizes()
  return adminRequest<PrizeAward[]>("/prize-awards")
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
      department: winner.department,
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

  return adminRequest<PrizeAward | null>(`/campaigns/${campaignId}/winner`, {
    method: "POST",
  })
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

  await adminRequest<void>(`/campaigns/${campaignId}/prize-award`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  })
}
