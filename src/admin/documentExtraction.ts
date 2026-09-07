import { mergeQuestionAndAnswerTexts } from "./documentParser.mjs"
import { extractQuestionDocumentText } from "./questionRepository"
import type { DocumentTextExtraction, ExtractedQuestion } from "./types"

export interface DocumentSetExtractionResult {
  questionText: string
  answerText: string
  questionExtraction: DocumentTextExtraction
  answerExtraction: DocumentTextExtraction
  questions: ExtractedQuestion[]
}

export async function extractQuestionSet(
  questionFile: File,
  answerFile: File,
): Promise<DocumentSetExtractionResult> {
  const [questionExtraction, answerExtraction] = await Promise.all([
    extractQuestionDocumentText(questionFile, "question"),
    extractQuestionDocumentText(answerFile, "answer"),
  ])
  return {
    questionText: questionExtraction.text,
    answerText: answerExtraction.text,
    questionExtraction,
    answerExtraction,
    questions: mergeQuestionAndAnswerTexts(
      questionExtraction.text,
      answerExtraction.text,
    ),
  }
}
