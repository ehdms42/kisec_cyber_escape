import { toMarkdown } from "@mdgate/hwp"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import {
  cleanDocumentText,
  mergeQuestionAndAnswerTexts,
  parseQuestionsFromText,
} from "./documentParser.mjs"
import type { ExtractedQuestion } from "./types"

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface DocumentExtractionResult {
  text: string
  questions: ExtractedQuestion[]
}

export interface DocumentSetExtractionResult {
  questionText: string
  answerText: string
  questions: ExtractedQuestion[]
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? ""
}

async function extractPdfText(file: File) {
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  })
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const items = content.items
        .filter((item) => "str" in item && item.str.trim())
        .map((item) => {
          if (!("str" in item)) return null
          return {
            text: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
          }
        })
        .filter((item) => item !== null)
        .sort((left, right) => {
          const sameLine =
            Math.abs(left.y - right.y) <=
            Math.max(left.height, right.height) * 0.45
          return sameLine ? left.x - right.x : right.y - left.y
        })

      const lines: Array<{
        y: number
        height: number
        parts: typeof items
      }> = []
      for (const item of items) {
        const line = lines.find(
          (candidate) =>
            Math.abs(candidate.y - item.y) <=
            Math.max(candidate.height, item.height) * 0.45,
        )
        if (line) {
          line.parts.push(item)
          line.height = Math.max(line.height, item.height)
        } else {
          lines.push({ y: item.y, height: item.height, parts: [item] })
        }
      }

      pages.push(
        lines
          .sort((left, right) => right.y - left.y)
          .map((line) =>
            line.parts
              .sort((left, right) => left.x - right.x)
              .map(({ text }) => text)
              .join(" "),
          )
          .join("\n"),
      )
    }
  } finally {
    await document.destroy()
  }

  return pages.join("\n\n")
}

async function extractHwpText(file: File) {
  return toMarkdown(new Uint8Array(await file.arrayBuffer()))
}

export async function extractDocumentText(file: File) {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("문서 크기는 20MB 이하여야 합니다.")
  }

  const extension = getExtension(file.name)
  if (!["pdf", "hwp", "hwpx"].includes(extension)) {
    throw new Error("PDF, HWP 또는 HWPX 파일만 업로드할 수 있습니다.")
  }

  const extracted =
    extension === "pdf"
      ? await extractPdfText(file)
      : await extractHwpText(file)
  const text = cleanDocumentText(extracted)

  if (!text) {
    throw new Error(
      "문서에서 텍스트를 찾지 못했습니다. 스캔 PDF는 문자 인식된 파일로 다시 저장해 주세요.",
    )
  }
  return text
}

export async function extractQuestionDocument(
  file: File,
): Promise<DocumentExtractionResult> {
  const text = await extractDocumentText(file)
  return { text, questions: parseQuestionsFromText(text) }
}

export async function extractQuestionSet(
  questionFile: File,
  answerFile: File,
): Promise<DocumentSetExtractionResult> {
  const [questionText, answerText] = await Promise.all([
    extractDocumentText(questionFile),
    extractDocumentText(answerFile),
  ])
  return {
    questionText,
    answerText,
    questions: mergeQuestionAndAnswerTexts(questionText, answerText),
  }
}
