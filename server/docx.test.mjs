import assert from "node:assert/strict"
import test from "node:test"
import { strToU8, zipSync } from "fflate"
import { validateDocumentFile } from "./data.mjs"
import { extractDocument } from "./document-extraction.mjs"
import { docxXmlToText, isDocxBuffer } from "./docx.mjs"

function paragraph(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function table(rows) {
  return `<w:tbl>${rows
    .map(
      (cells) =>
        `<w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`
}

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
}

function docxBuffer(body) {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8(documentXml(body)),
    }),
  )
}

test("Word 문단은 줄로, 표는 칸 구분 행으로 바꾼다", () => {
  const text = docxXmlToText(
    documentXml(
      paragraph("1. 안전한 행동은?") +
        `<w:p><w:r><w:t>① 화면</w:t></w:r><w:r><w:tab/><w:t>잠금 &amp; 로그아웃</w:t></w:r></w:p>` +
        `<w:p><w:del><w:r><w:delText>삭제된 글</w:delText></w:r></w:del><w:r><w:t>② 비밀번호 공유</w:t></w:r></w:p>` +
        table([
          ["문항", "정답"],
          ["1", "①"],
        ]),
    ),
  )
  assert.equal(
    text,
    "1. 안전한 행동은?\n① 화면 잠금 & 로그아웃\n② 비밀번호 공유\n| 문항 | 정답 |\n| 1 | ① |\n",
  )
})

test("DOCX는 본문 파트가 있는 ZIP일 때만 허용한다", () => {
  const docx = docxBuffer(paragraph("본문"))
  assert.equal(isDocxBuffer(docx), true)
  assert.equal(
    validateDocumentFile({ originalname: "문제지.docx", buffer: docx }),
    ".docx",
  )
  assert.throws(
    () => validateDocumentFile({ originalname: "renamed.pdf", buffer: docx }),
    /지원되는 한글, Word 또는 PDF 문서 형식/,
  )
  const plainZip = Buffer.from(zipSync({ "notes.txt": strToU8("hello") }))
  assert.throws(
    () => validateDocumentFile({ originalname: "fake.docx", buffer: plainZip }),
    /지원되는 한글, Word 또는 PDF 문서 형식/,
  )
  assert.throws(
    () =>
      validateDocumentFile({
        originalname: "fake.docx",
        buffer: Buffer.from("not a zip"),
      }),
    /지원되는 한글, Word 또는 PDF 문서 형식/,
  )
})

test("Word 문제지에서 텍스트와 구조 분석 방식을 반환한다", async () => {
  const docx = docxBuffer(
    paragraph("1. 올바른 보안 수칙은?") +
      paragraph("① 화면 잠금") +
      paragraph("② 비밀번호 공유") +
      paragraph("2. 안전한 메일 확인 방법은?") +
      paragraph("① 발신자 확인") +
      paragraph("② 첨부파일 바로 실행"),
  )
  const result = await extractDocument(
    { originalname: "questions.docx", buffer: docx },
    { role: "question" },
  )
  assert.equal(result.method, "docx-structure")
  assert.match(result.text, /1\. 올바른 보안 수칙은\?\n① 화면 잠금/)
})
