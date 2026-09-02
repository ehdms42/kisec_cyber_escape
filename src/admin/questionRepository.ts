import { QUESTIONS } from "../data/questions"
import { fallbackAnswerFor } from "../data/questionAnswers"
import { adminRequest } from "./serverApi"
import type {
  AdminQuestion,
  DocumentStatus,
  QuestionDocument,
  QuestionInput,
} from "./types"

export async function listQuestions(): Promise<AdminQuestion[]> {
  return adminRequest<AdminQuestion[]>("/questions")
}

export async function saveQuestion(input: QuestionInput) {
  const path = input.id ? `/questions/${input.id}` : "/questions"
  return adminRequest<AdminQuestion>(path, {
    method: input.id ? "PUT" : "POST",
    body: JSON.stringify(input),
  })
}

export async function createQuestions(inputs: QuestionInput[]) {
  if (inputs.length === 0) return []
  return adminRequest<AdminQuestion[]>("/questions/bulk", {
    method: "POST",
    body: JSON.stringify({ questions: inputs }),
  })
}

export async function deleteQuestion(id: string) {
  await adminRequest<void>(`/questions/${id}`, { method: "DELETE" })
}

export async function importLegacyQuestions() {
  const existing = await listQuestions()
  const existingOrdinals = new Set(existing.map((question) => question.ordinal))
  const missing = QUESTIONS.filter(
    (question) => !existingOrdinals.has(question.id),
  ).map<QuestionInput>((question) => ({
    ordinal: question.id,
    category: question.category,
    prompt: question.question,
    options: question.options,
    correctAnswer: fallbackAnswerFor(question.id),
    explanation: question.explanation,
    sourceReference: question.reference ?? "",
    status: "published",
    sourceDocumentId: null,
    answerDocumentId: null,
  }))

  return createQuestions(missing)
}

export async function registerQuestionDocument(
  file: File,
  role: "question" | "answer",
  pairId: string,
) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("role", role)
  formData.append("pairId", pairId)
  return adminRequest<QuestionDocument>("/documents", {
    method: "POST",
    body: formData,
  })
}

export async function updateQuestionDocument(
  id: string,
  status: DocumentStatus,
  extractedText: string,
  extractedCount: number,
  extractionError: string | null = null,
) {
  await adminRequest<void>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      extractedText,
      extractedCount,
      extractionError,
    }),
  })
}
