import { adminRequest } from "./serverApi"

export interface DashboardQuestionAccuracy {
  ordinal: number
  category: string
  attempts: number
  correct: number
  accuracyRate: number
}

export interface DashboardLeader {
  campaignId: string
  campaignTitle: string
  institutionName: string
  nickname: string
  verifiedScore: number
}

export interface DashboardRecentSession {
  campaignId: string
  campaignTitle: string
  institutionName: string
  endedAt: string
}

export interface DashboardStalledAttempt {
  attemptId: string
  campaignId: string
  nickname: string
  lastSeenAt: string
}

export interface DashboardSummary {
  sessionsInProgress: number
  sessionsToday: number
  totalParticipants: number
  totalAttempts: number
  completedAttempts: number
  completionRate: number
  averageElapsedSeconds: number
  questionAccuracy: DashboardQuestionAccuracy[]
  hintUsageTotal: number
  currentLeaders: DashboardLeader[]
  recentCompletedSessions: DashboardRecentSession[]
  stalledAttempts: DashboardStalledAttempt[]
  degraded: boolean
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return adminRequest<DashboardSummary>("/dashboard")
}
