export type SecurityLevel = "beginner" | "intermediate" | "advanced"

export const SECURITY_LEVELS: readonly SecurityLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
]

export const SECURITY_LEVEL_META: Record<SecurityLevel, {
  label: string
  shortDescription: string
}> = {
  beginner: {
    label: "초급",
    shortDescription: "정보보안 개념을 처음 익히는 단계",
  },
  intermediate: {
    label: "중급",
    shortDescription: "기본 개념으로 간단한 문제를 해결하는 단계",
  },
  advanced: {
    label: "고급",
    shortDescription: "웹 해킹이나 CTF 경험이 있는 단계",
  },
}

export function isSecurityLevel(value: unknown): value is SecurityLevel {
  return SECURITY_LEVELS.includes(value as SecurityLevel)
}

export function recommendedLevelForQuestion(ordinal: number): SecurityLevel {
  if (ordinal <= 10) return "beginner"
  if (ordinal <= 20) return "intermediate"
  return "advanced"
}

export function diagnosedSecurityLevel(score: number): SecurityLevel {
  if (score >= 3) return "advanced"
  if (score >= 2) return "intermediate"
  return "beginner"
}
