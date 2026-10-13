import type { SecurityLevel } from "../game/securityLevel"

export type AttemptStatus = "in_progress" | "completed" | "voided"

export type CampaignStatus = "draft" | "open" | "in_progress" | "paused" | "closed" | "finalized" | "cancelled"

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
  status: CampaignStatus
  leaderboardVisible: boolean
  finalizedAt: string | null
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
  department: string
  status: AttemptStatus
  answeredCount: number
  verifiedScore: number
  hintPenaltyTotal?: number
  startedAt: string
  lastSeenAt: string
  completedAt: string | null
  adjustmentReason: string | null
}

export interface Participant {
  id: string
  nickname: string
  department: string
  contact: string
  registeredBy: "self" | "admin" | "csv"
  createdAt: string
  attempt: {
    id: string
    status: AttemptStatus
    verifiedScore: number
    answeredCount: number
    startedAt: string
    lastSeenAt: string
    completedAt: string | null
  } | null
}

export interface ParticipantImportResult {
  row: number
  nickname: string
  status: "registered" | "duplicate" | "skipped"
  message: string
}

export interface LiveAttemptEntry {
  attemptId: string
  nickname: string
  securityLevel: string
  verifiedScore: number
  answeredCount: number
  status: "in_progress" | "completed" | "voided"
  lastSeenAt: string
  idleSeconds: number
  stalled: boolean
}

export interface AttemptAnswerDetail {
  questionId: string
  ordinal: number | null
  category: string
  prompt: string
  options: string[]
  correctAnswer: number | null
  selectedAnswer: number
  isCorrect: boolean
  answeredAt: string
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
  department: string
  securityLevel: SecurityLevel | null
  institutionName: string
  campaignTitle: string
  requiredQuestionCount: number
  state: Record<string, unknown>
  verifiedScore: number
  answeredCount: number
  startedAt: string
  completedAt: string | null
}

export interface HintRevealResult {
  hintText: string
  penaltyApplied: number
  alreadyRevealed: boolean
  hintPenaltyTotal: number
}

export interface AnswerVerification {
  accepted: boolean
  correct: boolean
  selectedAnswer: number
  verifiedScore: number
  answeredCount: number
}
