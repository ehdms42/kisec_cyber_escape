export interface RankingEntry {
  rank: number
  attemptId: string
  campaignId: string
  campaignTitle: string
  institutionName: string
  nickname: string
  verifiedScore: number
  answeredCount: number
  elapsedSeconds: number
  startedAt: string
  completedAt: string
}

export type PrizeStatus = "selected" | "notified" | "delivered"

export interface PrizeAward {
  id: string
  campaignId: string
  campaignTitle: string
  institutionName: string
  attemptId: string
  nickname: string
  status: PrizeStatus
  note: string
  selectedAt: string
  deliveredAt: string | null
}
