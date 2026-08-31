import { QUESTIONS } from "../data/questions"
import { isAdminDemoMode, supabase } from "../lib/supabase"
import type {
  AdminQuestion,
  DocumentStatus,
  QuestionDocument,
  QuestionInput,
} from "./types"

const DEMO_QUESTION_KEY = "cyber-quest-admin-demo-questions"
const DEMO_DOCUMENT_KEY = "cyber-quest-admin-demo-documents"

interface QuestionRow {
  id: string
  ordinal: number
  category: string
  prompt: string
  options: string[]
  correct_answer: number
  explanation: string
  source_reference: string
  status: "draft" | "published"
  source_document_id: string | null
  created_at: string
  updated_at: string
}

interface DocumentRow {
  id: string
  original_name: string
  storage_path: string
  mime_type: string
  status: DocumentStatus
  extracted_count: number
  extraction_error: string | null
  created_at: string
}

function now() {
  return new Date().toISOString()
}

function toAdminQuestion(row: QuestionRow): AdminQuestion {
  return {
    id: row.id,
    ordinal: row.ordinal,
    category: row.category,
    prompt: row.prompt,
    options: row.options,
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    sourceReference: row.source_reference,
    status: row.status,
    sourceDocumentId: row.source_document_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toQuestionDocument(row: DocumentRow): QuestionDocument {
  return {
    id: row.id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    status: row.status,
    extractedCount: row.extracted_count,
    extractionError: row.extraction_error,
    createdAt: row.created_at,
  }
}

function defaultDemoQuestions(): AdminQuestion[] {
  const timestamp = now()

  return QUESTIONS.map((question) => ({
    id: `legacy-${question.id}`,
    ordinal: question.id,
    category: question.category,
    prompt: question.question,
    options: question.options,
    correctAnswer: question.answer,
    explanation: question.explanation,
    sourceReference: question.reference ?? "",
    status: "published",
    sourceDocumentId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

function readDemoQuestions() {
  const stored = window.localStorage.getItem(DEMO_QUESTION_KEY)
  if (!stored) return defaultDemoQuestions()

  try {
    return JSON.parse(stored) as AdminQuestion[]
  } catch {
    return defaultDemoQuestions()
  }
}

function writeDemoQuestions(questions: AdminQuestion[]) {
  window.localStorage.setItem(DEMO_QUESTION_KEY, JSON.stringify(questions))
}

function readDemoDocuments() {
  const stored = window.localStorage.getItem(DEMO_DOCUMENT_KEY)
  if (!stored) return [] as QuestionDocument[]

  try {
    return JSON.parse(stored) as QuestionDocument[]
  } catch {
    return [] as QuestionDocument[]
  }
}

function writeDemoDocuments(documents: QuestionDocument[]) {
  window.localStorage.setItem(DEMO_DOCUMENT_KEY, JSON.stringify(documents))
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase 환경 변수가 설정되지 않았습니다.")
  }

  return supabase
}

export async function listQuestions(): Promise<AdminQuestion[]> {
  if (isAdminDemoMode) {
    return readDemoQuestions().sort((a, b) => a.ordinal - b.ordinal)
  }

  const client = requireSupabase()
  const { data, error } = await client
    .from("questions")
    .select("*")
    .order("ordinal", { ascending: true })

  if (error) throw error
  return (data as QuestionRow[]).map(toAdminQuestion)
}

export async function saveQuestion(input: QuestionInput) {
  if (isAdminDemoMode) {
    const questions = readDemoQuestions()
    const timestamp = now()

    if (input.id) {
      const index = questions.findIndex((question) => question.id === input.id)
      if (index < 0) throw new Error("수정할 문제를 찾을 수 없습니다.")

      questions[index] = {
        ...questions[index],
        ...input,
        id: input.id,
        sourceDocumentId: input.sourceDocumentId ?? null,
        updatedAt: timestamp,
      }
      writeDemoQuestions(questions)
      return questions[index]
    }

    const question: AdminQuestion = {
      ...input,
      id: crypto.randomUUID(),
      sourceDocumentId: input.sourceDocumentId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    questions.push(question)
    writeDemoQuestions(questions)
    return question
  }

  const client = requireSupabase()
  const payload = {
    ordinal: input.ordinal,
    category: input.category,
    prompt: input.prompt,
    options: input.options,
    correct_answer: input.correctAnswer,
    explanation: input.explanation,
    source_reference: input.sourceReference,
    status: input.status,
    source_document_id: input.sourceDocumentId ?? null,
  }

  const query = input.id
    ? client.from("questions").update(payload).eq("id", input.id)
    : client.from("questions").insert(payload)
  const { data, error } = await query.select("*").single()

  if (error) throw error
  return toAdminQuestion(data as QuestionRow)
}

export async function createQuestions(inputs: QuestionInput[]) {
  if (isAdminDemoMode) {
    const created: AdminQuestion[] = []
    for (const input of inputs) created.push(await saveQuestion(input))
    return created
  }

  if (inputs.length === 0) return []
  const client = requireSupabase()
  const payload = inputs.map((input) => ({
    ordinal: input.ordinal,
    category: input.category,
    prompt: input.prompt,
    options: input.options,
    correct_answer: input.correctAnswer,
    explanation: input.explanation,
    source_reference: input.sourceReference,
    status: input.status,
    source_document_id: input.sourceDocumentId ?? null,
  }))
  const { data, error } = await client
    .from("questions")
    .insert(payload)
    .select("*")

  if (error) throw error
  return (data as QuestionRow[]).map(toAdminQuestion)
}

export async function deleteQuestion(id: string) {
  if (isAdminDemoMode) {
    writeDemoQuestions(
      readDemoQuestions().filter((question) => question.id !== id),
    )
    return
  }

  const client = requireSupabase()
  const { error } = await client.from("questions").delete().eq("id", id)
  if (error) throw error
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
    correctAnswer: question.answer,
    explanation: question.explanation,
    sourceReference: question.reference ?? "",
    status: "published",
    sourceDocumentId: null,
  }))

  return createQuestions(missing)
}

function sanitizeFilename(filename: string) {
  return filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-")
}

export async function registerQuestionDocument(file: File, userId: string) {
  const id = crypto.randomUUID()
  const createdAt = now()

  if (isAdminDemoMode) {
    const document: QuestionDocument = {
      id,
      originalName: file.name,
      storagePath: `demo/${id}/${sanitizeFilename(file.name)}`,
      mimeType: file.type || "application/octet-stream",
      status: "processing",
      extractedCount: 0,
      extractionError: null,
      createdAt,
    }
    writeDemoDocuments([document, ...readDemoDocuments()])
    return document
  }

  const client = requireSupabase()
  const storagePath = `${userId}/${id}/${sanitizeFilename(file.name)}`
  const { error: uploadError } = await client.storage
    .from("question-documents")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })

  if (uploadError) throw uploadError

  const { data, error } = await client
    .from("question_documents")
    .insert({
      id,
      original_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || "application/octet-stream",
      status: "processing",
      uploaded_by: userId,
    })
    .select("*")
    .single()

  if (error) {
    await client.storage.from("question-documents").remove([storagePath])
    throw error
  }

  return toQuestionDocument(data as DocumentRow)
}

export async function updateQuestionDocument(
  id: string,
  status: DocumentStatus,
  extractedText: string,
  extractedCount: number,
  extractionError: string | null = null,
) {
  if (isAdminDemoMode) {
    const documents = readDemoDocuments()
    const index = documents.findIndex((document) => document.id === id)
    if (index >= 0) {
      documents[index] = {
        ...documents[index],
        status,
        extractedCount,
        extractionError,
      }
      writeDemoDocuments(documents)
    }
    return
  }

  const client = requireSupabase()
  const { error } = await client
    .from("question_documents")
    .update({
      status,
      extracted_text: extractedText,
      extracted_count: extractedCount,
      extraction_error: extractionError,
    })
    .eq("id", id)

  if (error) throw error
}

export async function listQuestionDocuments(): Promise<QuestionDocument[]> {
  if (isAdminDemoMode) return readDemoDocuments()

  const client = requireSupabase()
  const { data, error } = await client
    .from("question_documents")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data as DocumentRow[]).map(toQuestionDocument)
}
