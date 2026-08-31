import { QUIZ_LENGTH } from "../game/config"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { QUESTIONS, type Question } from "./questions"

interface PublishedQuestionRow {
  ordinal: number
  category: string
  prompt: string
  options: unknown
  correct_answer: number
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
  if (row.correct_answer < 0 || row.correct_answer >= row.options.length) {
    throw new Error(`${row.ordinal}번 문제의 정답 번호가 올바르지 않습니다.`)
  }
  return {
    id: row.ordinal,
    category: row.category,
    question: row.prompt,
    options: row.options,
    answer: row.correct_answer,
    explanation: row.explanation,
    reference: row.source_reference || undefined,
  }
}

export async function loadGameQuestions(): Promise<Question[]> {
  if (!isSupabaseConfigured || !supabase) return QUESTIONS.slice(0, QUIZ_LENGTH)

  const { data, error } = await supabase
    .from("questions")
    .select(
      "ordinal, category, prompt, options, correct_answer, explanation, source_reference",
    )
    .eq("status", "published")
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
