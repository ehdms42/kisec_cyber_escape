import { isAdminDemoMode, supabase } from "../lib/supabase"
import { QUESTIONS } from "../data/questions"
import type {
  AttemptSession,
  AttemptStatus,
  AttemptSummary,
  Campaign,
  Institution,
  PublicCampaign,
} from "./institutionTypes"

const DEMO_INSTITUTION_KEY = "cyber-quest-demo-institutions"
const DEMO_CAMPAIGN_KEY = "cyber-quest-demo-campaigns"
const DEMO_ATTEMPT_KEY = "cyber-quest-demo-attempts"
const DEMO_ANSWER_KEY = "cyber-quest-demo-attempt-answers"
const DEMO_SESSION_KEY = `${DEMO_ATTEMPT_KEY}-sessions`

interface CompleteAttemptResult {
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
  const { data, error } = await requireSupabase()
    .from("institutions")
    .select("id, name, slug, active, created_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    createdAt: row.created_at,
  }))
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

  const client = requireSupabase()
  const payload = { name: input.name, slug: input.slug, active: input.active }
  const query = input.id
    ? client.from("institutions").update(payload).eq("id", input.id)
    : client.from("institutions").insert(payload)
  const { data, error } = await query.select("*").single()
  if (error) throw error
  return data
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
  const { error } = await requireSupabase()
    .from("institutions")
    .delete()
    .eq("id", id)
  if (error) throw error
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (isAdminDemoMode) return demoCampaigns()
  const { data, error } = await requireSupabase()
    .from("campaigns")
    .select(
      "id, institution_id, title, public_token, active, starts_at, ends_at, required_question_count, created_at, institutions(name)",
    )
    .order("created_at", { ascending: false })
  if (error) throw error
  return data.map((row) => {
    const relation = row.institutions as unknown as { name: string } | null
    return {
      id: row.id,
      institutionId: row.institution_id,
      institutionName: relation?.name ?? "알 수 없는 기관",
      title: row.title,
      publicToken: row.public_token,
      active: row.active,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      requiredQuestionCount: row.required_question_count,
      createdAt: row.created_at,
    }
  })
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

  const client = requireSupabase()
  const payload = {
    institution_id: input.institutionId,
    title: input.title,
    active: input.active,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    required_question_count: input.requiredQuestionCount,
  }
  const query = input.id
    ? client.from("campaigns").update(payload).eq("id", input.id)
    : client.from("campaigns").insert(payload)
  const { data, error } = await query.select("*").single()
  if (error) throw error
  return data
}

export async function deleteCampaign(id: string) {
  if (isAdminDemoMode) {
    writeDemo(
      DEMO_CAMPAIGN_KEY,
      demoCampaigns().filter((item) => item.id !== id),
    )
    return
  }
  const { error } = await requireSupabase()
    .from("campaigns")
    .delete()
    .eq("id", id)
  if (error) throw error
}

export async function listAttempts(): Promise<AttemptSummary[]> {
  if (isAdminDemoMode) return demoAttempts()
  const { data, error } = await requireSupabase()
    .from("game_attempts")
    .select(
      "id, campaign_id, status, answered_count, verified_score, started_at, last_seen_at, completed_at, adjustment_reason, participants(nickname), campaigns(title, institutions(name))",
    )
    .order("started_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return data.map((row) => {
    const participant = row.participants as unknown as {
      nickname: string
    } | null
    const campaign = row.campaigns as unknown as {
      title: string
      institutions: { name: string } | null
    } | null
    return {
      id: row.id,
      campaignId: row.campaign_id,
      campaignTitle: campaign?.title ?? "배포 종료",
      institutionName: campaign?.institutions?.name ?? "알 수 없는 기관",
      nickname: participant?.nickname ?? "알 수 없음",
      status: row.status as AttemptStatus,
      answeredCount: row.answered_count,
      verifiedScore: row.verified_score,
      startedAt: row.started_at,
      lastSeenAt: row.last_seen_at,
      completedAt: row.completed_at,
      adjustmentReason: row.adjustment_reason,
    }
  })
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

  const { error } = await requireSupabase().rpc("admin_adjust_attempt", {
    p_attempt_id: attemptId,
    p_action: action,
    p_reason: reason,
  })
  if (error) throw error
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
    }
  }
  const { data, error } = await requireSupabase().rpc("get_campaign_public", {
    p_public_token: token,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error("유효하지 않거나 종료된 배포 링크입니다.")
  return {
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    institutionName: row.institution_name,
    requiredQuestionCount: row.required_question_count,
  }
}

function demoIdentifier(token: string, participantCode: string) {
  return `${token}:${participantCode.trim().toLocaleLowerCase("ko-KR")}`
}

export async function startOrResumeAttempt(
  publicToken: string,
  participantCode: string,
  nickname: string,
): Promise<AttemptSession> {
  if (isAdminDemoMode) {
    const campaign = await getPublicCampaign(publicToken)
    const key = demoIdentifier(publicToken, participantCode)
    const sessions = demoSessions()
    const existing = sessions[key]
    if (existing) return existing
    const session: AttemptSession = {
      attemptId: crypto.randomUUID(),
      resumeToken: crypto.randomUUID(),
      status: "in_progress",
      nickname,
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
  if (error) throw error
  return {
    attemptId: data.attempt_id,
    resumeToken: data.resume_token,
    status: data.status,
    nickname: data.nickname,
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
  if (error) throw error
}

export async function recordAttemptAnswer(
  session: AttemptSession,
  questionOrdinal: number,
  selectedAnswer: number,
) {
  if (!session.resumeToken || session.status !== "in_progress") return
  if (isAdminDemoMode) {
    const answers = readDemo<Record<string, Record<string, number>>>(
      DEMO_ANSWER_KEY,
      {},
    )
    const attemptAnswers = answers[session.attemptId] ?? {}
    if (String(questionOrdinal) in attemptAnswers) return
    attemptAnswers[String(questionOrdinal)] = selectedAnswer
    answers[session.attemptId] = attemptAnswers
    writeDemo(DEMO_ANSWER_KEY, answers)
    const answeredCount = Object.keys(attemptAnswers).length
    const verifiedScore = Object.entries(attemptAnswers).filter(
      ([ordinal, answer]) =>
        QUESTIONS.find((question) => question.id === Number(ordinal))
          ?.answer === answer,
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
    return
  }
  const { error } = await requireSupabase().rpc("record_attempt_answer", {
    p_attempt_id: session.attemptId,
    p_resume_token: session.resumeToken,
    p_question_ordinal: questionOrdinal,
    p_selected_answer: selectedAnswer,
  })
  if (error) throw error
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
    const completedAt = now()
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
      completedAt,
      resumeToken: null,
    }))
    return {
      verified_score: attempt.verifiedScore,
      answered_count: attempt.answeredCount,
    }
  }
  const { data, error } = await requireSupabase().rpc("complete_attempt", {
    p_attempt_id: session.attemptId,
    p_resume_token: session.resumeToken,
    p_state: state,
  })
  if (error) throw error
  return data as CompleteAttemptResult
}
