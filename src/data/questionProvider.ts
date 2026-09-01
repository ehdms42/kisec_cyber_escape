import { QUIZ_LENGTH } from "../game/config"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import type { Question } from "./questions"

interface PublishedQuestionRow {
  ordinal: number
  category: string
  prompt: string
  options: unknown
  explanation: string
  source_reference: string
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
  }
}

export async function loadGameQuestions(): Promise<Question[]> {
  if (!isSupabaseConfigured || !supabase) {
    if (!import.meta.env.DEV) {
      throw new Error("운영 환경의 공개 문제 저장소가 설정되지 않았습니다.")
    }
    const [{ QUESTIONS }, { QUESTION_ANSWERS }] = await Promise.all([
      import("./questions"),
      import("./questionAnswers"),
    ])
    return QUESTIONS.slice(0, QUIZ_LENGTH).map((question) => ({
      ...question,
      answer: QUESTION_ANSWERS[question.id],
    }))
  }

  const { data, error } = await supabase
    .from("published_questions")
    .select("ordinal, category, prompt, options, explanation, source_reference")
    .order("ordinal", { ascending: true })
    .limit(QUIZ_LENGTH)

  if (error)
    throw new Error(`공개 문제를 불러오지 못했습니다: ${error.message}`)
  if (data.length < QUIZ_LENGTH) {
    throw new Error(
      `공개 문제가 ${data.length}개입니다. 관리자가 ${QUIZ_LENGTH}개를 공개해야 시작할 수 있습니다.`,
    )
  }

  return (data as PublishedQuestionRow[]).map(toQuestion)
}
