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
    shortDescription: "기본 보안 수칙을 차근차근 익혀가는 단계",
  },
  intermediate: {
    label: "중급",
    shortDescription: "보안 개념을 이해하고 실무 문제에 적용하는 단계",
  },
  advanced: {
    label: "고급",
    shortDescription: "복합적인 보안 위협까지 정확하게 판단하는 단계",
  },
}

export function isSecurityLevel(value: unknown): value is SecurityLevel {
  return SECURITY_LEVELS.includes(value as SecurityLevel)
}

export function securityLevelFromResult(
  correctAnswers: number,
  totalQuestions: number,
): SecurityLevel {
  const safeTotal = Math.max(1, totalQuestions)
  const rate = Math.min(1, Math.max(0, correctAnswers) / safeTotal)
  if (rate >= 0.8) return "advanced"
  if (rate >= 0.6) return "intermediate"
  return "beginner"
}
