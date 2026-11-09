import { QUIZ_LENGTH } from "../game/config"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { QUESTIONS, type Question } from "./questions"

interface PublishedQuestionRow {
  ordinal: number
  category: string
  prompt: string
  options: unknown
  explanation: string
  source_reference: string
  hints: unknown
}

interface ParsedHint {
  text: string
  penalty: number
}

function isParsedHint(item: unknown): item is ParsedHint {
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof (item as { text?: unknown }).text === "string" &&
    typeof (item as { penalty?: unknown }).penalty === "number"
  )
}

function toHints(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const hints = value.filter(isParsedHint)
  return hints.length > 0 ? hints : undefined
}

function toQuestion(row: PublishedQuestionRow): Question {
  if (
    !Array.isArray(row.options) ||
    !row.options.every((item) => typeof item === "string")
  ) {
    throw new Error(`${row.ordinal}번 문제의 보기 형식이 올바르지 않습니다.`)
  }
  return {
    id: row.ordinal,
    category: row.category,
    question: row.prompt,
    options: row.options,
    explanation: row.explanation,
    reference: row.source_reference || undefined,
    hints: toHints(row.hints),
  }
}

export async function loadGameQuestions(
  usePublishedQuestions = false,
  campaignToken: string | null = null,
): Promise<Question[]> {
  if (!usePublishedQuestions || !isSupabaseConfigured || !supabase) {
    return QUESTIONS.slice(0, QUIZ_LENGTH)
  }

  // 기관 세션에 문항 구성이 저장되어 있으면 그 문항만 정해진 순서로 출제한다.
  if (campaignToken) {
    const { data, error } = await supabase.rpc("get_campaign_questions", {
      p_public_token: campaignToken,
    })
    // PGRST202: 마이그레이션 적용 전이라 함수가 없으면 기존 방식으로 출제한다.
    if (error && error.code !== "PGRST202")
      throw new Error(`세션 문제를 불러오지 못했습니다: ${error.message}`)
    if (!error && data.length > 0) {
      return (data as PublishedQuestionRow[]).map(toQuestion)
    }
  }

  const { data, error } = await supabase.rpc("get_published_questions", {
    p_limit: QUIZ_LENGTH,
  })

  if (error)
    throw new Error(`공개 문제를 불러오지 못했습니다: ${error.message}`)
  if (data.length < QUIZ_LENGTH) {
    throw new Error(
      `공개 문제가 ${data.length}개입니다. 관리자가 ${QUIZ_LENGTH}개를 공개해야 시작할 수 있습니다.`,
    )
  }

  return (data as PublishedQuestionRow[]).map(toQuestion)
}
