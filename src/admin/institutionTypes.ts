export type AttemptStatus = "in_progress" | "completed" | "voided"

export interface Institution {
  id: string
  name: string
  slug: string
  active: boolean
  createdAt: string
}

export interface Campaign {
  id: string
  institutionId: string
  institutionName: string
  title: string
  publicToken: string
  active: boolean
  startsAt: string | null
  endsAt: string | null
  requiredQuestionCount: number
  createdAt: string
}

export interface AttemptSummary {
  id: string
  campaignId: string
  campaignTitle: string
  institutionName: string
  nickname: string
  status: AttemptStatus
  answeredCount: number
  verifiedScore: number
  startedAt: string
  lastSeenAt: string
  completedAt: string | null
  adjustmentReason: string | null
}

export interface PublicCampaign {
  campaignId: string
  campaignTitle: string
  institutionName: string
  requiredQuestionCount: number
}

export interface AttemptSession {
  attemptId: string
  resumeToken: string | null
  status: AttemptStatus
  nickname: string
  institutionName: string
  campaignTitle: string
  requiredQuestionCount: number
  state: Record<string, unknown>
  verifiedScore: number
  answeredCount: number
  startedAt: string
  completedAt: string | null
}
