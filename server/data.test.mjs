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
        buffer: Buffer.from("PK-test"),
      },
      { role: "answer", pairId },
    )

    assert.equal(question.documentRole, "question")
    assert.equal(answer.documentRole, "answer")
    assert.equal(question.pairId, answer.pairId)
    assert.equal(answer.mimeType, "application/vnd.hancom.hwpx")
  })
})
