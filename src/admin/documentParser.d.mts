import type { ExtractedQuestion } from "./types"

export interface AnswerSheetEntry {
  correctAnswer: number
  explanation: string
  conflicted?: boolean
}

export function cleanDocumentText(text: string): string
export function parseQuestionSheet(text: string): ExtractedQuestion[]
export function parseAnswerSheet(text: string): Map<number, AnswerSheetEntry>
export function mergeQuestionAndAnswerTexts(
  questionText: string,
  answerText: string,
): ExtractedQuestion[]
export function parseQuestionsFromText(text: string): ExtractedQuestion[]
