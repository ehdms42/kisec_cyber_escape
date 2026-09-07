import path from "node:path"
import { randomUUID } from "node:crypto"
import { toMarkdown } from "@mdgate/hwp"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import {
  cleanDocumentText,
  parseAnswerSheet,
  parseQuestionSheet,
} from "../src/admin/documentParser.mjs"

const DIRECT_EXTRACTION_THRESHOLD = 0.68
const OCR_TIMEOUT_MS = 90_000

function documentExtension(filename) {
  return path.extname(filename ?? "").toLowerCase()
}

function itemBounds(item) {
  const vertices = item?.boundingPoly?.vertices
  if (!Array.isArray(vertices) || vertices.length === 0) return null
  const xs = vertices.map((vertex) => Number(vertex?.x)).filter(Number.isFinite)
  const ys = vertices.map((vertex) => Number(vertex?.y)).filter(Number.isFinite)
  if (!xs.length || !ys.length) return null
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  }
}

function tableBounds(table) {
  const directBounds = itemBounds(table)
  if (directBounds) return directBounds
  const bounds = (table?.cells ?? []).map(itemBounds).filter(Boolean)
  if (!bounds.length) return null
  return {
    left: Math.min(...bounds.map((bound) => bound.left)),
    right: Math.max(...bounds.map((bound) => bound.right)),
    top: Math.min(...bounds.map((bound) => bound.top)),
    bottom: Math.max(...bounds.map((bound) => bound.bottom)),
  }
}

function centerInside(bounds, container) {
  if (!bounds || !container) return false
  const x = (bounds.left + bounds.right) / 2
  const y = (bounds.top + bounds.bottom) / 2
  return (
    x >= container.left &&
    x <= container.right &&
    y >= container.top &&
    y <= container.bottom
  )
}

function clovaCellText(cell) {
  const fromLines = (cell?.cellTextLines ?? [])
    .flatMap((line) => line?.cellWords ?? [])
    .map((word) => String(word?.inferText ?? "").trim())
    .filter(Boolean)
    .join(" ")
  return fromLines || String(cell?.inferText ?? "").trim()
}

function clovaTableLines(table) {
  const rows = new Map()
  for (const cell of table?.cells ?? []) {
    const rowIndex = Number(cell?.rowIndex ?? 0)
    const columnIndex = Number(cell?.columnIndex ?? 0)
    const row = rows.get(rowIndex) ?? []
    row[columnIndex] = clovaCellText(cell)
    rows.set(rowIndex, row)
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, cells]) => `| ${cells.map((cell) => cell ?? "").join(" | ")} |`)
    .filter((line) => line.replace(/[|\s]/g, ""))
}

function clovaFieldLines(fields, tableAreas) {
  const lines = []
  let current = []
  for (const field of fields ?? []) {
    if (tableAreas.some((area) => centerInside(itemBounds(field), area))) {
      continue
    }
    const text = String(field?.inferText ?? "").trim()
    if (text) current.push(text)
    if (field?.lineBreak && current.length) {
      lines.push(current.join(" "))
      current = []
    }
  }
  if (current.length) lines.push(current.join(" "))
  return lines
}

export function clovaResponseToText(payload) {
  const pages = []
  for (const image of payload?.images ?? []) {
    if (image?.inferResult && image.inferResult !== "SUCCESS") continue
    const tables = Array.isArray(image?.tables) ? image.tables : []
    const tableAreas = tables.map(tableBounds).filter(Boolean)
    const fieldLines = clovaFieldLines(image?.fields, tableAreas)
    const structuredTables = tables.flatMap(clovaTableLines)
    const seen = new Set()
    const pageLines = [...fieldLines, ...structuredTables].filter((line) => {
      const normalized = line.replace(/\s+/g, " ").trim()
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    if (pageLines.length) pages.push(pageLines.join("\n"))
  }
  return cleanDocumentText(pages.join("\n\n"))
}

function pdfLineText(items) {
  const lines = []
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
  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) =>
      line.parts
        .sort((left, right) => left.x - right.x)
        .map(({ text }) => text)
        .join(" "),
    )
    .join("\n")
}

async function extractPdfText(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
  })
  const document = await loadingTask.promise
  const pages = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const items = content.items
        .filter((item) => "str" in item && item.str.trim())
        .map((item) => ({
          text: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        }))
      pages.push(pdfLineText(items))
    }
  } finally {
    await document.destroy()
  }
  return cleanDocumentText(pages.join("\n\n"))
}

async function extractHwpText(buffer) {
  return cleanDocumentText(await toMarkdown(new Uint8Array(buffer)))
}

export function assessExtraction(text, role) {
  const normalized = cleanDocumentText(text)
  if (!normalized) return { confidence: 0, structuredCount: 0 }

  const visibleCharacters = normalized.replace(/\s/g, "")
  const readableCharacters =
    visibleCharacters.match(/[가-힣A-Za-z0-9]/g)?.length ?? 0
  const readableRatio =
    readableCharacters / Math.max(visibleCharacters.length, 1)
  const replacementRatio =
    (visibleCharacters.match(/[�□]/g)?.length ?? 0) /
    Math.max(visibleCharacters.length, 1)
  const structuredCount =
    role === "question"
      ? parseQuestionSheet(normalized).filter(
          (question) => question.prompt && question.options.length >= 2,
        ).length
      : parseAnswerSheet(normalized).size

  const lengthScore = Math.min(0.35, visibleCharacters.length / 2_000)
  const readabilityScore = Math.min(0.25, readableRatio * 0.3)
  const structureScore = Math.min(0.4, structuredCount * 0.08)
  const confidence = Math.max(
    0,
    Math.min(
      1,
      lengthScore + readabilityScore + structureScore - replacementRatio,
    ),
  )
  return { confidence, structuredCount }
}

async function extractWithClova(file, config) {
  const message = {
    version: "V2",
    requestId: randomUUID(),
    timestamp: Date.now(),
    lang: "ko",
    images: [
      {
        format: "pdf",
        name: path.basename(file.originalname, path.extname(file.originalname)),
      },
    ],
    enableTableDetection: true,
  }
  const body = new FormData()
  body.append(
    "file",
    new Blob([file.buffer], { type: "application/pdf" }),
    file.originalname,
  )
  body.append("message", JSON.stringify(message))

  const response = await config.fetch(config.invokeUrl, {
    method: "POST",
    headers: { "X-OCR-SECRET": config.secret },
    body,
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`문자 인식 서버가 ${response.status} 오류를 반환했습니다.`)
  }
  const payload = await response.json()
  const text = clovaResponseToText(payload)
  if (!text) throw new Error("문자 인식 결과에서 텍스트를 찾지 못했습니다.")
  return text
}

export async function extractDocument(file, options) {
  const role = options?.role
  if (!["question", "answer"].includes(role)) {
    throw new Error("문제지 또는 해답지 구분이 필요합니다.")
  }
  const extension = documentExtension(file.originalname)
  let directText = ""
  let directError = null

  try {
    directText =
      extension === ".pdf"
        ? await extractPdfText(file.buffer)
        : await extractHwpText(file.buffer)
  } catch (error) {
    directError = error
  }

  const directAssessment = assessExtraction(directText, role)
  const clovaEnabled = Boolean(
    options?.clova?.invokeUrl && options?.clova?.secret,
  )
  const shouldUseOcr =
    extension === ".pdf" &&
    clovaEnabled &&
    directAssessment.confidence < DIRECT_EXTRACTION_THRESHOLD

  if (shouldUseOcr) {
    try {
      const ocrText = await extractWithClova(file, {
        ...options.clova,
        fetch: options.clova.fetch ?? fetch,
      })
      const ocrAssessment = assessExtraction(ocrText, role)
      if (
        ocrAssessment.structuredCount > directAssessment.structuredCount ||
        ocrAssessment.confidence >= directAssessment.confidence
      ) {
        return {
          text: ocrText,
          method: "clova-ocr",
          confidence: ocrAssessment.confidence,
          warnings: [],
        }
      }
    } catch (error) {
      if (!directText) throw error
      return {
        text: directText,
        method: "pdf-text",
        confidence: directAssessment.confidence,
        warnings: [
          `문자 인식 재처리에 실패해 PDF 내장 텍스트를 사용했습니다: ${error.message}`,
        ],
      }
    }
  }

  if (!directText) {
    if (extension === ".pdf" && !clovaEnabled) {
      throw new Error(
        "스캔 PDF에서 텍스트를 찾지 못했습니다. 서버에 CLOVA_OCR_INVOKE_URL과 CLOVA_OCR_SECRET을 등록해 주세요.",
      )
    }
    if ([".hwp", ".hwpx"].includes(extension)) {
      throw new Error(
        "한글 문서의 글과 표를 읽지 못했습니다. 암호·배포용 문서인지 확인하고, 복잡한 문서는 한컴에서 PDF로 저장해 다시 올려 주세요.",
      )
    }
    throw directError ?? new Error("문서에서 텍스트를 찾지 못했습니다.")
  }

  const warnings = []
  if (directAssessment.confidence < DIRECT_EXTRACTION_THRESHOLD) {
    warnings.push(
      extension === ".pdf"
        ? "문서 구조 인식률이 낮습니다. 문자 인식 설정을 연결하면 자동으로 다시 분석합니다."
        : "한글 문서의 복잡한 표나 배치가 일부 누락됐을 수 있으니 추출 원문을 확인해 주세요.",
    )
  }
  return {
    text: directText,
    method: extension === ".pdf" ? "pdf-text" : "hwp-structure",
    confidence: directAssessment.confidence,
    warnings,
  }
}
