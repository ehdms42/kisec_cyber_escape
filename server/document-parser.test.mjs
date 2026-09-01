import assert from "node:assert/strict"
import test from "node:test"
import {
  mergeQuestionAndAnswerTexts,
  parseAnswerSheet,
  parseQuestionSheet,
} from "../src/admin/documentParser.mjs"

test("서로 다른 문서 형식의 문제와 해답을 번호로 결합한다", () => {
  const questionText = `
1. 올바른 보안 수칙을 고르시오.
① 화면을 잠근다 ② 비밀번호를 공유한다 ③ 업데이트를 끈다 ④ 백신을 삭제한다

2번 안전한 비밀번호를 고르시오.
가. 1234
나. 서로 다른 문자 종류를 조합한 긴 비밀번호
다. 생년월일
라. 아이디와 같은 문자열
`
  const answerText = `
| 문제 | 정답 | 해설 |
| --- | --- | --- |
| 1 | ① | 자리를 비울 때 화면을 잠가야 한다. |
| 2 | 나 | 길고 예측하기 어려운 비밀번호가 안전하다. |
`

  const questions = mergeQuestionAndAnswerTexts(questionText, answerText)
  assert.equal(questions.length, 2)
  assert.equal(questions[0].options.length, 4)
  assert.equal(questions[0].correctAnswer, 0)
  assert.match(questions[0].explanation, /화면을 잠가야/)
  assert.equal(questions[1].correctAnswer, 1)
  assert.deepEqual(questions[1].warnings, [])
})

test("숫자 보기와 다음 문제 번호를 구분한다", () => {
  const questions = parseQuestionSheet(`
1. 첫 번째 질문
1) 보기 하나
2) 보기 둘
3) 보기 셋
4) 보기 넷
2. 두 번째 질문
1) 선택 하나
2) 선택 둘
`)

  assert.equal(questions.length, 2)
  assert.equal(questions[0].sourceNumber, 1)
  assert.deepEqual(questions[0].options, [
    "보기 하나",
    "보기 둘",
    "보기 셋",
    "보기 넷",
  ])
  assert.equal(questions[1].sourceNumber, 2)
})

test("한 줄 정답표와 문항별 해설 형식을 모두 읽는다", () => {
  const answers = parseAnswerSheet(`
정답표
1 ③ 2 A 3 4

4번 정답: ② 해설: 접근 권한을 확인해야 한다.
추가 설명 문장입니다.
`)

  assert.equal(answers.get(1)?.correctAnswer, 2)
  assert.equal(answers.get(2)?.correctAnswer, 0)
  assert.equal(answers.get(3)?.correctAnswer, 3)
  assert.equal(answers.get(4)?.correctAnswer, 1)
  assert.match(answers.get(4)?.explanation ?? "", /추가 설명/)
})

test("해답지에서 찾지 못한 문항은 임의 정답으로 등록하지 않는다", () => {
  const [question] = mergeQuestionAndAnswerTexts(
    `1. 질문\n① 하나\n② 둘`,
    `2. ①`,
  )
  assert.equal(question.correctAnswer, -1)
  assert.match(question.warnings.join(" "), /정답 번호/)
})

test("중복 번호나 서로 충돌하는 정답은 자동 등록하지 않는다", () => {
  const questions = mergeQuestionAndAnswerTexts(
    `1. 첫 질문\n① 하나\n② 둘\n1. 중복 질문\n① 셋\n② 넷`,
    `1번 정답: ①\n1번 정답: ②`,
  )

  assert.equal(questions.length, 2)
  assert.ok(questions.every((question) => question.correctAnswer === -1))
  assert.match(questions[0].warnings.join(" "), /중복/)
})
