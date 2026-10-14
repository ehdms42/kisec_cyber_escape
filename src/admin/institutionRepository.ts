import { isAdminDemoMode, supabase } from "../lib/supabase"
import { isFallbackAnswerCorrect } from "../data/questionAnswers"
import { announceLeaderboardChange } from "../game/liveLeaderboard"
import { isSecurityLevel, securityLevelFromResult } from "../game/securityLevel"
import type {
  AnswerVerification,
  AttemptAnswerDetail,
  AttemptSession,
  AttemptSummary,
  Campaign,
  CampaignStatus,
  HintRevealResult,
  Institution,
  LiveAttemptEntry,
  Participant,
  ParticipantImportResult,
  PublicCampaign,
} from "./institutionTypes"
import { adminRequest } from "./serverApi"

const DEMO_INSTITUTION_KEY = "cyber-quest-demo-institutions"
const DEMO_CAMPAIGN_KEY = "cyber-quest-demo-campaigns"
const DEMO_ATTEMPT_KEY = "cyber-quest-demo-attempts"
const DEMO_ANSWER_KEY = "cyber-quest-demo-attempt-answers"
const DEMO_SESSION_KEY = `${DEMO_ATTEMPT_KEY}-sessions`
const DEMO_HINT_KEY = "cyber-quest-demo-revealed-hints"

interface CompleteAttemptResult {
  verified_score: number
  answered_count: number
  security_level: "beginner" | "intermediate" | "advanced"
}

interface AnswerResult {
  accepted: boolean
  correct: boolean
  selected_answer: number
  verified_score: number
  answered_count: number
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.")
  return supabase
}

function now() {
  return new Date().toISOString()
}

function readDemo<T>(key: string, fallback: T): T {
  const value = window.localStorage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function writeDemo(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function demoInstitutions() {
  return readDemo<Institution[]>(DEMO_INSTITUTION_KEY, [])
}

function demoCampaigns() {
  return readDemo<Campaign[]>(DEMO_CAMPAIGN_KEY, [])
}

function demoAttempts() {
  return readDemo<AttemptSummary[]>(DEMO_ATTEMPT_KEY, [])
}

function demoSessions() {
  return readDemo<Record<string, AttemptSession>>(DEMO_SESSION_KEY, {})
}

function updateDemoSession(
  attemptId: string,
  update: (session: AttemptSession) => AttemptSession,
) {
  const sessions = demoSessions()
  for (const [key, session] of Object.entries(sessions)) {
    if (session.attemptId === attemptId) sessions[key] = update(session)
  }
  writeDemo(DEMO_SESSION_KEY, sessions)
}

export async function listInstitutions(): Promise<Institution[]> {
  if (isAdminDemoMode) return demoInstitutions()
  return adminRequest<Institution[]>("/institutions")
}

export async function saveInstitution(input: {
  id?: string
  name: string
  slug: string
  active: boolean
}) {
  if (isAdminDemoMode) {
    const institutions = demoInstitutions()
    const institution: Institution = {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      active: input.active,
      createdAt:
        institutions.find((item) => item.id === input.id)?.createdAt ?? now(),
    }
    const next = input.id
      ? institutions.map((item) => (item.id === input.id ? institution : item))
      : [institution, ...institutions]
    writeDemo(DEMO_INSTITUTION_KEY, next)
    return institution
  }

  const path = input.id ? `/institutions/${input.id}` : "/institutions"
  return adminRequest<Institution>(path, {
    method: input.id ? "PUT" : "POST",
    body: JSON.stringify(input),
  })
}

export async function deleteInstitution(id: string) {
  if (isAdminDemoMode) {
    writeDemo(
      DEMO_INSTITUTION_KEY,
      demoInstitutions().filter((item) => item.id !== id),
    )
    writeDemo(
      DEMO_CAMPAIGN_KEY,
      demoCampaigns().filter((item) => item.institutionId !== id),
    )
    return
  }
  await adminRequest<void>(`/institutions/${id}`, { method: "DELETE" })
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (isAdminDemoMode) return demoCampaigns()
  return adminRequest<Campaign[]>("/campaigns")
}

export async function saveCampaign(input: {
  id?: string
  institutionId: string
  institutionName?: string
  title: string
  active: boolean
  startsAt: string | null
  endsAt: string | null
  requiredQuestionCount: number
}) {
  if (isAdminDemoMode) {
    const campaigns = demoCampaigns()
    const campaign: Campaign = {
      id: input.id ?? crypto.randomUUID(),
      institutionId: input.institutionId,
      institutionName: input.institutionName ?? "기관",
      title: input.title,
      publicToken:
        campaigns.find((item) => item.id === input.id)?.publicToken ??
        crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      active: input.active,
      status:
        campaigns.find((item) => item.id === input.id)?.status ??
        (input.active ? "open" : "draft"),
      leaderboardVisible:
        campaigns.find((item) => item.id === input.id)?.leaderboardVisible ??
        true,
      finalizedAt:
        campaigns.find((item) => item.id === input.id)?.finalizedAt ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      requiredQuestionCount: input.requiredQuestionCount,
      createdAt:
        campaigns.find((item) => item.id === input.id)?.createdAt ?? now(),
    }
    const next = input.id
      ? campaigns.map((item) => (item.id === input.id ? campaign : item))
      : [campaign, ...campaigns]
    writeDemo(DEMO_CAMPAIGN_KEY, next)
    return campaign
  }

  const path = input.id ? `/campaigns/${input.id}` : "/campaigns"
  return adminRequest<Campaign>(path, {
    method: input.id ? "PUT" : "POST",
    body: JSON.stringify(input),
  })
}

export async function updateCampaignStatus(id: string, status: CampaignStatus) {
  if (isAdminDemoMode) {
    const campaigns = demoCampaigns().map((campaign) =>
      campaign.id === id
        ? {
            ...campaign,
            status,
            active: ["open", "in_progress", "paused"].includes(status),
            finalizedAt: status === "finalized" ? now() : campaign.finalizedAt,
          }
        : campaign,
    )
    writeDemo(DEMO_CAMPAIGN_KEY, campaigns)
    return campaigns.find((campaign) => campaign.id === id)!
  }
  return adminRequest<Campaign>(`/campaigns/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}

export async function updateCampaignLeaderboardVisibility(
  id: string,
  visible: boolean,
) {
  if (isAdminDemoMode) {
    const campaigns = demoCampaigns().map((campaign) =>
      campaign.id === id
        ? { ...campaign, leaderboardVisible: visible }
        : campaign,
    )
    writeDemo(DEMO_CAMPAIGN_KEY, campaigns)
    return campaigns.find((campaign) => campaign.id === id)!
  }
  return adminRequest<Campaign>(`/campaigns/${id}/leaderboard-visibility`, {
    method: "PATCH",
    body: JSON.stringify({ visible }),
  })
}

export async function listParticipants(
  campaignId: string,
): Promise<Participant[]> {
  if (isAdminDemoMode) {
    throw new Error("데모 모드에서는 참가자 관리를 지원하지 않습니다.")
  }
  return adminRequest<Participant[]>(`/campaigns/${campaignId}/participants`)
}

export async function importParticipants(
  campaignId: string,
  rows: Array<{
    nickname: string
    participantCode: string
    department?: string
    contact?: string
  }>,
): Promise<ParticipantImportResult[]> {
  if (isAdminDemoMode) {
    throw new Error("데모 모드에서는 참가자 일괄 등록을 지원하지 않습니다.")
  }
  return adminRequest<ParticipantImportResult[]>(
    `/campaigns/${campaignId}/participants/import`,
    { method: "POST", body: JSON.stringify({ rows }) },
  )
}

export async function listCampaignLiveAttempts(
  campaignId: string,
): Promise<LiveAttemptEntry[]> {
  if (isAdminDemoMode) {
    throw new Error("데모 모드에서는 실시간 모니터링을 지원하지 않습니다.")
  }
  return adminRequest<LiveAttemptEntry[]>(`/campaigns/${campaignId}/live`)
}

export async function listAttemptAnswers(
  attemptId: string,
): Promise<AttemptAnswerDetail[]> {
  if (isAdminDemoMode) {
    throw new Error("데모 모드에서는 답안 상세 조회를 지원하지 않습니다.")
  }
  return adminRequest<AttemptAnswerDetail[]>(`/attempts/${attemptId}/answers`)
}

export async function deleteCampaign(id: string) {
  if (isAdminDemoMode) {
    writeDemo(
      DEMO_CAMPAIGN_KEY,
      demoCampaigns().filter((item) => item.id !== id),
    )
    return
  }
  await adminRequest<void>(`/campaigns/${id}`, { method: "DELETE" })
}

export async function listAttempts(): Promise<AttemptSummary[]> {
  if (isAdminDemoMode) return demoAttempts()
  return adminRequest<AttemptSummary[]>("/attempts")
}

export async function adjustAttempt(
  attemptId: string,
  action: "resume" | "void" | "reset",
  reason: string,
) {
  if (isAdminDemoMode) {
    const attempts = demoAttempts().map((attempt) => {
      if (attempt.id !== attemptId) return attempt
      if (action === "reset") {
        return {
          ...attempt,
          status: "in_progress" as const,
          answeredCount: 0,
          verifiedScore: 0,
          completedAt: null,
          adjustmentReason: reason,
        }
      }
      return {
        ...attempt,
        status: action === "void" ? "voided" as const : "in_progress" as const,
        completedAt: action === "resume" ? null : attempt.completedAt,
        adjustmentReason: reason,
      }
    })
    writeDemo(DEMO_ATTEMPT_KEY, attempts)
    updateDemoSession(attemptId, (session) => {
      if (action === "reset") {
        return {
          ...session,
          status: "in_progress",
          state: {},
          verifiedScore: 0,
          answeredCount: 0,
          completedAt: null,
          resumeToken: crypto.randomUUID(),
          startedAt: now(),
        }
      }
      return {
        ...session,
        status: action === "void" ? "voided" : "in_progress",
        completedAt: action === "resume" ? null : session.completedAt,
        resumeToken:
          action === "resume" && !session.resumeToken
            ? crypto.randomUUID()
            : session.resumeToken,
      }
    })
    if (action === "reset") {
      const answers = readDemo<Record<string, Record<string, number>>>(
        DEMO_ANSWER_KEY,
        {},
      )
      delete answers[attemptId]
      writeDemo(DEMO_ANSWER_KEY, answers)
    }
    return
  }

  await adminRequest<void>(`/attempts/${attemptId}`, {
    method: "PATCH",
    body: JSON.stringify({ action, reason }),
  })
}

export async function getPublicCampaign(
  token: string,
): Promise<PublicCampaign> {
  if (isAdminDemoMode) {
    const campaign = demoCampaigns().find(
      (item) => item.publicToken === token && item.active,
    )
    if (!campaign) throw new Error("유효하지 않거나 종료된 배포 링크입니다.")
    return {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      institutionName: campaign.institutionName,
      requiredQuestionCount: campaign.requiredQuestionCount,
      leaderboardVisible: campaign.leaderboardVisible,
    }
  }
  const { data, error } = await requireSupabase().rpc("get_campaign_public", {
    p_public_token: token,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error("유효하지 않거나 종료된 배포 링크입니다.")
  return {
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    institutionName: row.institution_name,
    requiredQuestionCount: row.required_question_count,
    leaderboardVisible: row.leaderboard_visible,
  }
}

function demoIdentifier(token: string, participantCode: string) {
  return `${token}:${participantCode.trim().toLocaleLowerCase("ko-KR")}`
}

export async function lookupParticipantDepartment(
  publicToken: string,
  participantCode: string,
): Promise<string> {
  if (isAdminDemoMode) {
    // 데모 모드에서는 사전등록 참가자 개념이 없어 항상 같은 더미 부서를 돌려준다.
    await getPublicCampaign(publicToken)
    if (participantCode.trim().length < 4) {
      throw new Error("참여 코드는 4자 이상이어야 합니다.")
    }
    return "데모부서"
  }
  const { data, error } = await requireSupabase().rpc(
    "lookup_participant_department",
    {
      p_public_token: publicToken,
      p_participant_code: participantCode,
    },
  )
  if (error) throw new Error(error.message)
  if (!data) {
    throw new Error("등록되지 않은 참여 코드입니다. 담당자에게 문의해 주세요.")
  }
  return data as string
}

export async function startOrResumeAttempt(
  publicToken: string,
  participantCode: string,
  nickname: string,
  department: string,
): Promise<AttemptSession> {
  if (isAdminDemoMode) {
    const campaign = await getPublicCampaign(publicToken)
    const key = demoIdentifier(publicToken, participantCode)
    const sessions = demoSessions()
    const existing = sessions[key]
    if (existing) {
      return {
        ...existing,
        securityLevel: isSecurityLevel(existing.securityLevel)
          ? existing.securityLevel
          : existing.status === "completed"
            ? securityLevelFromResult(
                existing.verifiedScore,
                existing.requiredQuestionCount,
              )
            : null,
      }
    }
    const session: AttemptSession = {
      attemptId: crypto.randomUUID(),
      resumeToken: crypto.randomUUID(),
      status: "in_progress",
      nickname,
      department,
      securityLevel: null,
      institutionName: campaign.institutionName,
      campaignTitle: campaign.campaignTitle,
      requiredQuestionCount: campaign.requiredQuestionCount,
      state: {},
      verifiedScore: 0,
      answeredCount: 0,
      startedAt: now(),
      completedAt: null,
    }
    sessions[key] = session
    writeDemo(DEMO_SESSION_KEY, sessions)
    const attempts = demoAttempts()
    attempts.unshift({
      id: session.attemptId,
      campaignId: campaign.campaignId,
      campaignTitle: campaign.campaignTitle,
      institutionName: campaign.institutionName,
      nickname,
      department,
      status: "in_progress",
      answeredCount: 0,
      verifiedScore: 0,
      startedAt: session.startedAt,
      lastSeenAt: session.startedAt,
      completedAt: null,
      adjustmentReason: null,
    })
    writeDemo(DEMO_ATTEMPT_KEY, attempts)
    return session
  }

  const { data, error } = await requireSupabase().rpc(
    "start_or_resume_attempt",
    {
      p_public_token: publicToken,
      p_participant_code: participantCode,
      p_nickname: nickname,
    },
  )
  if (error) throw new Error(error.message)
  return {
    attemptId: data.attempt_id,
    resumeToken: data.resume_token,
    status: data.status,
    nickname: data.nickname,
    department: data.department,
    securityLevel: isSecurityLevel(data.security_level)
      ? data.security_level
      : null,
    institutionName: data.institution_name,
    campaignTitle: data.campaign_title,
    requiredQuestionCount: data.required_question_count,
    state: data.state ?? {},
    verifiedScore: data.verified_score,
    answeredCount: data.answered_count,
    startedAt: data.started_at,
    completedAt: data.completed_at,
  }
}

export async function saveAttemptProgress(
  session: AttemptSession,
  state: Record<string, unknown>,
) {
  if (!session.resumeToken || session.status !== "in_progress") return
  if (isAdminDemoMode) {
    updateDemoSession(session.attemptId, (current) => ({ ...current, state }))
    writeDemo(
      DEMO_ATTEMPT_KEY,
      demoAttempts().map((attempt) =>
        attempt.id === session.attemptId
          ? { ...attempt, lastSeenAt: now() }
          : attempt,
      ),
    )
    return
  }
  const { error } = await requireSupabase().rpc("save_attempt_progress", {
    p_attempt_id: session.attemptId,
    p_resume_token: session.resumeToken,
    p_state: state,
  })
  if (error) throw new Error(error.message)
}

export async function recordAttemptAnswer(
  session: AttemptSession,
  questionOrdinal: number,
  selectedAnswer: number,
): Promise<AnswerVerification> {
  if (!session.resumeToken || session.status !== "in_progress") {
    throw new Error("진행 중인 응시 기록을 찾을 수 없습니다.")
  }
  if (isAdminDemoMode) {
    const answers = readDemo<Record<string, Record<string, number>>>(
      DEMO_ANSWER_KEY,
      {},
    )
    const attemptAnswers = answers[session.attemptId] ?? {}
    const existingAnswer = attemptAnswers[String(questionOrdinal)]
    const alreadyCorrect =
      existingAnswer !== undefined &&
      isFallbackAnswerCorrect(questionOrdinal, existingAnswer)

    if (!alreadyCorrect) {
      attemptAnswers[String(questionOrdinal)] = selectedAnswer
      answers[session.attemptId] = attemptAnswers
      writeDemo(DEMO_ANSWER_KEY, answers)
    }
    const answeredCount = Object.keys(attemptAnswers).length
    const verifiedScore = Object.entries(attemptAnswers).filter(
      ([ordinal, answer]) => isFallbackAnswerCorrect(Number(ordinal), answer),
    ).length
    writeDemo(
      DEMO_ATTEMPT_KEY,
      demoAttempts().map((attempt) =>
        attempt.id === session.attemptId
          ? { ...attempt, answeredCount, verifiedScore, lastSeenAt: now() }
          : attempt,
      ),
    )
    updateDemoSession(session.attemptId, (current) => ({
      ...current,
      answeredCount,
      verifiedScore,
    }))
    const result = {
      accepted: !alreadyCorrect,
      correct: alreadyCorrect
        ? true
        : isFallbackAnswerCorrect(questionOrdinal, selectedAnswer),
      selectedAnswer: alreadyCorrect ? existingAnswer : selectedAnswer,
      verifiedScore,
      answeredCount,
    }
    announceLeaderboardChange()
    return result
  }
  const { data, error } = await requireSupabase().rpc("record_attempt_answer", {
    p_attempt_id: session.attemptId,
    p_resume_token: session.resumeToken,
    p_question_ordinal: questionOrdinal,
    p_selected_answer: selectedAnswer,
  })
  if (error) throw new Error(error.message)
  const result = data as AnswerResult | null
  if (!result) throw new Error("답안 검증 결과를 받지 못했습니다.")
  announceLeaderboardChange()
  return {
    accepted: result.accepted,
    correct: result.correct,
    selectedAnswer: result.selected_answer,
    verifiedScore: result.verified_score,
    answeredCount: result.answered_count,
  }
}

export async function getWrongQuestionOrdinals(
  session: AttemptSession,
): Promise<number[]> {
  if (!session.resumeToken || session.status !== "in_progress") return []
  if (isAdminDemoMode) {
    const answers = readDemo<Record<string, Record<string, number>>>(
      DEMO_ANSWER_KEY,
      {},
    )
    const attemptAnswers = answers[session.attemptId] ?? {}
    return Object.entries(attemptAnswers)
      .filter(
        ([ordinal, answer]) =>
          !isFallbackAnswerCorrect(Number(ordinal), answer),
      )
      .map(([ordinal]) => Number(ordinal))
      .sort((a, b) => a - b)
  }
  const { data, error } = await requireSupabase().rpc(
    "get_attempt_wrong_ordinals",
    {
      p_attempt_id: session.attemptId,
      p_resume_token: session.resumeToken,
    },
  )
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data as number[] : []
}

export async function revealHint(
  session: AttemptSession,
  questionOrdinal: number,
  hintIndex: number,
): Promise<HintRevealResult> {
  if (!session.resumeToken || session.status !== "in_progress") {
    throw new Error("진행 중인 응시 기록을 찾을 수 없습니다.")
  }
  if (isAdminDemoMode) {
    const key = `${DEMO_HINT_KEY}:${session.attemptId}`
    const revealed = readDemo<Record<string, boolean>>(key, {})
    const hintKey = `${questionOrdinal}:${hintIndex}`
    const alreadyRevealed = Boolean(revealed[hintKey])
    if (!alreadyRevealed) {
      revealed[hintKey] = true
      writeDemo(key, revealed)
    }
    return {
      hintText: "데모 모드에서는 실제 힌트 내용을 제공하지 않습니다.",
      penaltyApplied: 0,
      alreadyRevealed,
      hintPenaltyTotal: 0,
    }
  }
  const { data, error } = await requireSupabase().rpc("reveal_attempt_hint", {
    p_attempt_id: session.attemptId,
    p_resume_token: session.resumeToken,
    p_question_ordinal: questionOrdinal,
    p_hint_index: hintIndex,
  })
  if (error) throw new Error(error.message)
  return {
    hintText: data.hint_text,
    penaltyApplied: data.penalty_applied,
    alreadyRevealed: data.already_revealed,
    hintPenaltyTotal: data.hint_penalty_total,
  }
}

export async function completeAttempt(
  session: AttemptSession,
  state: Record<string, unknown>,
) {
  if (!session.resumeToken || session.status !== "in_progress") return null
  if (isAdminDemoMode) {
    const attempt = demoAttempts().find((item) => item.id === session.attemptId)
    if (!attempt || attempt.answeredCount < session.requiredQuestionCount) {
      throw new Error("필수 문항 응답이 모두 기록되지 않았습니다.")
    }
    if ((await getWrongQuestionOrdinals(session)).length > 0) {
      throw new Error("오답을 모두 맞혀야 탈출할 수 있습니다.")
    }
    const completedAt = now()
    const securityLevel = securityLevelFromResult(
      attempt.verifiedScore,
      session.requiredQuestionCount,
    )
    writeDemo(
      DEMO_ATTEMPT_KEY,
      demoAttempts().map((item) =>
        item.id === session.attemptId
          ? {
              ...item,
              status: "completed",
              completedAt,
              lastSeenAt: completedAt,
            }
          : item,
      ),
    )
    updateDemoSession(session.attemptId, (current) => ({
      ...current,
      status: "completed",
      state,
      securityLevel,
      completedAt,
      resumeToken: null,
    }))
    return {
      verified_score: attempt.verifiedScore,
      answered_count: attempt.answeredCount,
      security_level: securityLevel,
    }
  }
  const { data, error } = await requireSupabase().rpc("complete_attempt", {
    p_attempt_id: session.attemptId,
    p_resume_token: session.resumeToken,
    p_state: state,
  })
  if (error) throw new Error(error.message)
  return data as CompleteAttemptResult
}
