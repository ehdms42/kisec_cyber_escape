import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { createDataStore } from "./data.mjs"

async function withLocalStore(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "kisec-admin-data-"))
  try {
    const store = createDataStore({
      supabase: null,
      allowLocalData: true,
      dataDirectory: directory,
    })
    await callback(store)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("로컬 관리자 저장소에서 기관과 배포를 서버가 관리한다", async () => {
  await withLocalStore(async (store) => {
    const institution = await store.saveInstitution({
      name: "한국인터넷진흥원",
      slug: "kisec-test",
      active: true,
    })
    const campaign = await store.saveCampaign({
      institutionId: institution.id,
      title: "2026 보안 교육",
      active: true,
      startsAt: null,
      endsAt: null,
      requiredQuestionCount: 30,
    })

    assert.equal((await store.listInstitutions()).length, 1)
    assert.equal(
      (await store.listCampaigns())[0].institutionName,
      institution.name,
    )
    await assert.rejects(
      store.deleteInstitution(institution.id),
      /배포가 연결된 기관/,
    )
    await store.deleteCampaign(campaign.id)
    await store.deleteInstitution(institution.id)
    assert.deepEqual(await store.listInstitutions(), [])
  })
})

test("로그아웃한 관리자 세션 nonce를 만료 시각까지 거부한다", async () => {
  await withLocalStore(async (store) => {
    const nonce = "revoked-session-nonce"
    await store.revokeAdminSession(
      nonce,
      Math.floor(Date.now() / 1000) + 60,
      "kisec-admin",
    )
    assert.equal(await store.isSessionRevoked(nonce), true)
    assert.equal(await store.isSessionRevoked("another-session"), false)
  })
})

test("문제 일괄 등록은 번호 충돌 시 일부만 저장하지 않는다", async () => {
  await withLocalStore(async (store) => {
    const question = (ordinal) => ({
      ordinal,
      category: "보안",
      prompt: `${ordinal}번 문제`,
      options: ["보기 1", "보기 2"],
      correctAnswer: 0,
      explanation: "",
      sourceReference: "",
      status: "draft",
      sourceDocumentId: null,
      answerDocumentId: null,
    })

    await store.createQuestions([question(1), question(2)])
    await assert.rejects(
      store.createQuestions([question(3), question(2)]),
      /이미 사용 중인 문제 번호/,
    )
    assert.deepEqual(
      (await store.listQuestions()).map(({ ordinal }) => ordinal),
      [1, 2],
    )
  })
})

test("기존 문제 동기화의 정답은 서버 전용 키에서 결합한다", async () => {
  await withLocalStore(async (store) => {
    const [created] = await store.createLegacyQuestions([
      {
        ordinal: 1,
        category: "보안",
        prompt: "기존 문제",
        options: ["보기 1", "보기 2", "보기 3", "보기 4"],
        explanation: "",
        sourceReference: "",
        status: "published",
        sourceDocumentId: null,
        answerDocumentId: null,
      },
    ])

    assert.equal(created.correctAnswer, 3)
  })
})

test("문제지와 해답지를 한 세트로 구분해 저장한다", async () => {
  await withLocalStore(async (store) => {
    const pairId = "0198fb4a-94ab-7452-85de-dca777d333e1"
    const question = await store.registerDocument(
      {
        originalname: "questions.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("%PDF-test"),
      },
      { role: "question", pairId },
    )
    const answer = await store.registerDocument(
      {
        originalname: "answers.hwpx",
        mimetype: "application/zip",
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x74, 0x65, 0x73, 0x74]),
      },
      { role: "answer", pairId },
    )

    assert.equal(question.documentRole, "question")
    assert.equal(answer.documentRole, "answer")
    assert.equal(question.pairId, answer.pairId)
    assert.equal(answer.mimeType, "application/vnd.hancom.hwpx")
  })
})

test("문서 확장자와 매직 바이트가 다르면 저장 전에 거부한다", async () => {
  await withLocalStore(async (store) => {
    await assert.rejects(
      store.registerDocument(
        {
          originalname: "not-really.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        },
        {
          role: "question",
          pairId: "0198fb4a-94ab-7452-85de-dca777d333e1",
        },
      ),
      /실제 문서 형식/,
    )
  })
})
