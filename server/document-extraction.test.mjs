import assert from "node:assert/strict"
import test from "node:test"
import {
  assessExtraction,
  clovaResponseToText,
  extractDocument,
} from "./document-extraction.mjs"

function polygon(left, top, right, bottom) {
  return {
    vertices: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  }
}

test("CLOVA OCR 결과에서 일반 문장과 표 셀 구조를 함께 보존한다", () => {
  const text = clovaResponseToText({
    images: [
      {
        inferResult: "SUCCESS",
        fields: [
          {
            inferText: "보안 문제지",
            lineBreak: true,
            boundingPoly: polygon(0, 0, 100, 20),
          },
          {
            inferText: "중복 표 문자",
            lineBreak: true,
            boundingPoly: polygon(10, 110, 90, 130),
          },
        ],
        tables: [
          {
            cells: [
              {
                rowIndex: 0,
                columnIndex: 0,
                inferText: "문항",
                boundingPoly: polygon(0, 100, 50, 140),
              },
              {
                rowIndex: 0,
                columnIndex: 1,
                inferText: "정답",
                boundingPoly: polygon(50, 100, 100, 140),
              },
              {
                rowIndex: 1,
                columnIndex: 0,
                inferText: "1",
                boundingPoly: polygon(0, 140, 50, 180),
              },
              {
                rowIndex: 1,
                columnIndex: 1,
                inferText: "④",
                boundingPoly: polygon(50, 140, 100, 180),
              },
            ],
          },
        ],
      },
    ],
  })

  assert.match(text, /보안 문제지/)
  assert.match(text, /\| 문항 \| 정답 \|/)
  assert.match(text, /\| 1 \| ④ \|/)
  assert.doesNotMatch(text, /중복 표 문자/)
})

test("문항과 보기 구조가 있는 추출 결과에 더 높은 신뢰도를 부여한다", () => {
  const weak = assessExtraction("깨진 텍스트 일부", "question")
  const structured = assessExtraction(
    "1. 올바른 보안 수칙은 무엇입니까?\n① 화면 잠금\n② 비밀번호 공유\n\n2. 안전한 행동은?\n① 업데이트\n② 방치",
    "question",
  )

  assert.equal(weak.structuredCount, 0)
  assert.equal(structured.structuredCount, 2)
  assert.ok(structured.confidence > weak.confidence)
})

test("문자 층이 없는 PDF는 설정된 CLOVA OCR로 자동 재처리한다", async () => {
  const result = await extractDocument(
    {
      originalname: "scanned-answers.pdf",
      buffer: Buffer.from("%PDF-scanned-placeholder"),
    },
    {
      role: "answer",
      clova: {
        invokeUrl: "https://example.test/ocr",
        secret: "test-secret",
        fetch: async () =>
          new Response(
            JSON.stringify({
              images: [
                {
                  inferResult: "SUCCESS",
                  fields: [
                    { inferText: "1", lineBreak: false },
                    { inferText: "④", lineBreak: true },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
    },
  )

  assert.equal(result.method, "clova-ocr")
  assert.match(result.text, /1 ④/)
})
