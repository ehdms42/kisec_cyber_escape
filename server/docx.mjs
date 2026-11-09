import { unzipSync } from "fflate"

const DOCUMENT_PART = "word/document.xml"
const MAX_DOCUMENT_XML_BYTES = 40 * 1024 * 1024

const XML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeXmlText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const point =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return XML_ENTITIES[code] ?? entity
  })
}

function zipEntryNames(buffer) {
  const names = []
  unzipSync(new Uint8Array(buffer), {
    filter(file) {
      names.push(file.name)
      return false
    },
  })
  return names
}

// Word 문서는 ZIP 컨테이너 안에 word/document.xml 본문 파트를 가진다.
export function isDocxBuffer(buffer) {
  try {
    return zipEntryNames(buffer).includes(DOCUMENT_PART)
  } catch {
    return false
  }
}

function readDocumentXml(buffer) {
  const entries = unzipSync(new Uint8Array(buffer), {
    filter: (file) =>
      file.name === DOCUMENT_PART &&
      file.originalSize <= MAX_DOCUMENT_XML_BYTES,
  })
  const part = entries[DOCUMENT_PART]
  if (!part) {
    throw new Error("Word 문서 본문(word/document.xml)을 찾지 못했습니다.")
  }
  return new TextDecoder("utf-8").decode(part)
}

// 문단은 한 줄로, 표의 각 행은 "| 칸 | 칸 |" 형태로 바꿔
// 기존 문제지·해답지 파서가 PDF·HWP 추출 결과와 같은 방식으로 읽게 한다.
export function docxXmlToText(xml) {
  const lines = []
  const tables = []
  let paragraph = null
  let inText = false
  let deletedDepth = 0

  const tokens = /<(\/?)([A-Za-z0-9]+:[A-Za-z0-9]+)\b[^>]*?(\/?)>|([^<]+)/g
  for (const match of xml.matchAll(tokens)) {
    const [, closing, tag, selfClosing, text] = match
    if (text !== undefined) {
      if (inText && paragraph !== null && deletedDepth === 0) {
        paragraph += decodeXmlText(text)
      }
      continue
    }

    const table = tables.at(-1)
    if (tag === "w:del") {
      if (!selfClosing) deletedDepth += closing ? -1 : 1
      continue
    }
    if (tag === "w:t") {
      inText = !closing && !selfClosing
      continue
    }
    if (paragraph !== null && !closing && deletedDepth === 0) {
      if (tag === "w:tab") paragraph += " "
      if (tag === "w:br" || tag === "w:cr") paragraph += " "
    }

    if (tag === "w:p") {
      if (selfClosing) {
        if (!table) lines.push("")
        continue
      }
      if (!closing) {
        paragraph = ""
        continue
      }
      const value = (paragraph ?? "").replace(/\s+/g, " ").trim()
      paragraph = null
      if (table?.cell) {
        if (value) table.cell.push(value)
      } else {
        lines.push(value)
      }
      continue
    }

    if (tag === "w:tbl") {
      if (!closing) {
        tables.push({ row: null, cell: null })
        continue
      }
      tables.pop()
      if (!tables.length) lines.push("")
      continue
    }
    if (!table || tables.length > 1) {
      // 표 안의 표는 바깥 칸의 내용으로 이어 붙인다.
      if (tables.length > 1 && tag === "w:tc" && closing) {
        const inner = tables.at(-1)
        const outer = tables.at(-2)
        if (inner.cell?.length && outer.cell) outer.cell.push(...inner.cell)
        inner.cell = null
      } else if (tables.length > 1 && tag === "w:tc" && !closing) {
        tables.at(-1).cell = []
      }
      continue
    }
    if (tag === "w:tr") {
      if (!closing) {
        table.row = []
        continue
      }
      if (table.row?.some(Boolean)) {
        lines.push(`| ${table.row.join(" | ")} |`)
      }
      table.row = null
      continue
    }
    if (tag === "w:tc") {
      if (!closing) {
        table.cell = []
        continue
      }
      table.row?.push((table.cell ?? []).join(" "))
      table.cell = null
    }
  }

  return lines.join("\n")
}

export function extractDocxText(buffer) {
  return docxXmlToText(readDocumentXml(buffer))
}
