import { toMarkdown } from "@mdgate/hwp"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import type { ExtractedQuestion } from "./types"

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"]

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface DocumentExtractionResult {
  text: string
  questions: ExtractedQuestion[]
}

interface QuestionBlock {
  number: number
  lines: string[]
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? ""
}

function cleanDocumentText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
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
      const lines: string[] = []
      let currentLine = ""

      for (const item of content.items) {
        if (!("str" in item)) continue
        currentLine += `${item.str} `
        if (item.hasEOL) {
          lines.push(currentLine.trim())
          currentLine = ""
        }
      }

      if (currentLine.trim()) lines.push(currentLine.trim())
      pages.push(lines.join("\n"))
    }
  } finally {
    await document.destroy()
  }

  return pages.join("\n\n")
}

async function extractHwpText(file: File) {
  return toMarkdown(new Uint8Array(await file.arrayBuffer()))
}

function parseAnswerToken(value: string) {
  const normalized = value.trim().toUpperCase()
  const circledIndex = CIRCLED_NUMBERS.findIndex((number) =>
    normalized.includes(number),
  )
  if (circledIndex >= 0) return circledIndex

  const letter = normalized.match(/\b([A-H])\b/)
  if (letter) return letter[1].charCodeAt(0) - 65

  const number = normalized.match(/(?:^|\D)([1-8])(?:\D|$)/)
  return number ? Number(number[1]) - 1 : null
}

function findAnswerSection(lines: string[]) {
  return lines.findIndex((line) =>
    /^(?:정답|답안)(?:\s*표|\s*및\s*해설)?\s*[:：]?$/.test(line),
  )
}

function parseAnswerKey(lines: string[]) {
  const answers = new Map<number, number>()

  for (const line of lines) {
    const pattern =
      /(\d{1,3})\s*(?:번|[.)])?\s*[:：-]?\s*([①②③④⑤⑥⑦⑧A-Ha-h1-8])/g
    for (const match of line.matchAll(pattern)) {
      const answer = parseAnswerToken(match[2])
      if (answer !== null) answers.set(Number(match[1]), answer)
    }
  }

  return answers
}

function splitQuestionBlocks(lines: string[]) {
  const blocks: QuestionBlock[] = []
  let current: QuestionBlock | null = null

  for (const line of lines) {
    const match = line.match(
      /^(?:문제\s*)?(\d{1,3})\s*(?:[.)]|번(?:\s*문제)?[.)]?)\s*(.*)$/,
    )

    if (match) {
      if (current) blocks.push(current)
      current = {
        number: Number(match[1]),
        lines: match[2] ? [match[2]] : [],
      }
      continue
    }

    if (current) current.lines.push(line)
  }

  if (current) blocks.push(current)
  return blocks
}

function parseOption(line: string) {
  const circled = CIRCLED_NUMBERS.findIndex((number) => line.startsWith(number))
  if (circled >= 0) {
    return {
      index: circled,
      text: line.slice(CIRCLED_NUMBERS[circled].length).trim(),
    }
  }

  const numeric = line.match(/^\(?([1-8])\)?[.)]\s*(.+)$/)
  if (!numeric) return null
  return { index: Number(numeric[1]) - 1, text: numeric[2].trim() }
}

function parseBlock(
  block: QuestionBlock,
  answerKey: Map<number, number>,
): ExtractedQuestion {
  const promptLines: string[] = []
  const options: string[] = []
  const explanationLines: string[] = []
  let category = "미분류"
  let sourceReference = ""
  let correctAnswer = answerKey.get(block.number) ?? -1
  let section: "prompt" | "explanation" = "prompt"

  for (const originalLine of block.lines) {
    const line = originalLine.replace(/^\|?|\|?$/g, "").trim()
    if (!line) continue

    const categoryMatch = line.match(/^(?:분류|영역|카테고리)\s*[:：]\s*(.+)$/)
    if (categoryMatch) {
      category = categoryMatch[1].trim()
      continue
    }

    const sourceMatch = line.match(/^(?:출처|참고)\s*[:：]\s*(.+)$/)
    if (sourceMatch) {
      sourceReference = sourceMatch[1].trim()
      continue
    }

    const answerMatch = line.match(/^(?:정답|답)\s*[:：]?\s*(.+)$/)
    if (answerMatch) {
      const parsed = parseAnswerToken(answerMatch[1])
      if (parsed !== null) correctAnswer = parsed
      continue
    }

    const explanationMatch = line.match(/^(?:해설|설명)\s*[:：]?\s*(.*)$/)
    if (explanationMatch) {
      section = "explanation"
      if (explanationMatch[1]) explanationLines.push(explanationMatch[1])
      continue
    }

    const option = parseOption(line)
    if (option) {
      options[option.index] = option.text
      continue
    }

    if (section === "explanation") explanationLines.push(line)
    else promptLines.push(line)
  }

  const compactOptions = options.filter(Boolean)
  const warnings: string[] = []
  if (!promptLines.length) warnings.push("문제 본문을 확인해 주세요.")
  if (compactOptions.length < 2) warnings.push("보기가 두 개 미만입니다.")
  if (correctAnswer < 0 || correctAnswer >= compactOptions.length) {
    warnings.push("정답을 확인해 주세요.")
    correctAnswer = 0
  }
  if (!explanationLines.length) warnings.push("해설이 없습니다.")

  return {
    sourceNumber: block.number,
    category,
    prompt: promptLines.join("\n").trim(),
    options: compactOptions,
    correctAnswer,
    explanation: explanationLines.join("\n").trim(),
    sourceReference,
    warnings,
  }
}

export function parseQuestionsFromText(text: string) {
  const normalized = cleanDocumentText(text)
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const answerSection = findAnswerSection(lines)
  const questionLines =
    answerSection >= 0 ? lines.slice(0, answerSection) : lines
  const answerLines = answerSection >= 0 ? lines.slice(answerSection + 1) : []
  const answerKey = parseAnswerKey(answerLines)

  return splitQuestionBlocks(questionLines).map((block) =>
    parseBlock(block, answerKey),
  )
}

export async function extractQuestionDocument(
  file: File,
): Promise<DocumentExtractionResult> {
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

  return { text, questions: parseQuestionsFromText(text) }
}
