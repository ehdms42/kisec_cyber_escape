export type QuestionStatus = "draft" | "published"
export type DocumentStatus = "processing" | "review" | "completed" | "failed"

export interface AdminQuestion {
  id: string
  ordinal: number
  category: string
  prompt: string
  options: string[]
  correctAnswer: number
  explanation: string
  sourceReference: string
  status: QuestionStatus
  sourceDocumentId: string | null
  answerDocumentId: string | null
  createdAt: string
  updatedAt: string
}

export interface QuestionInput {
  id?: string
  ordinal: number
  category: string
  prompt: string
  options: string[]
  correctAnswer: number
  explanation: string
  sourceReference: string
  status: QuestionStatus
  sourceDocumentId?: string | null
  answerDocumentId?: string | null
}

export interface QuestionDocument {
  id: string
  originalName: string
  storagePath: string
  mimeType: string
  status: DocumentStatus
  extractedCount: number
  extractionError: string | null
  documentRole: "question" | "answer" | null
  pairId: string | null
  createdAt: string
}

export interface ExtractedQuestion {
  sourceNumber: number | null
  category: string
  prompt: string
  options: string[]
  correctAnswer: number
  explanation: string
  sourceReference: string
  warnings: string[]
}
