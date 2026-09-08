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

test("괄호·Q 표기와 여러 종류의 보기 기호를 읽는다", () => {
  const questions = parseQuestionSheet(`
(1) 첫 번째 질문
❶ 첫 보기
❷ 둘째 보기

Q2. 두 번째 질문
㉠ 선택 가
㉡ 선택 나

[3] 세 번째 질문
(A) 알파
(B) 베타
`)

  assert.equal(questions.length, 3)
  assert.deepEqual(questions[0].options, ["첫 보기", "둘째 보기"])
  assert.deepEqual(questions[1].options, ["선택 가", "선택 나"])
  assert.deepEqual(questions[2].options, ["알파", "베타"])
})

test("하이픈·콜론 정답표와 다른 원문 기호를 결합한다", () => {
  const questions = mergeQuestionAndAnswerTexts(
    `
(1) 첫 번째 질문
❶ 첫 보기
❷ 둘째 보기
Q2. 두 번째 질문
㉠ 선택 가
㉡ 선택 나
`,
    `1번 - ❷\n2: ㉠`,
  )

  assert.equal(questions[0].correctAnswer, 1)
  assert.equal(questions[1].correctAnswer, 0)
})

test("가로형 정답표의 문항 번호와 정답 행을 열 단위로 읽는다", () => {
  const answers = parseAnswerSheet(`
| 문항 | 1 | 2 | 3 |
| 정답 | ④ | ② | ① |
| 해설 | 네 번째 보기 | 두 번째 보기 | 첫 번째 보기 |
`)

  assert.equal(answers.get(1)?.correctAnswer, 3)
  assert.equal(answers.get(2)?.correctAnswer, 1)
  assert.equal(answers.get(3)?.correctAnswer, 0)
  assert.match(answers.get(1)?.explanation ?? "", /네 번째/)
})

test("문항 제목과 정답이 분리된 한글 해답지를 읽는다", () => {
  const answers = parseAnswerSheet(`
문제 모범답안 및 해설

1.(비공개 업무자료 처리)
정답 : 4번
설명 : -
참고 : 국가정보보안기본지침 제66조

2.(단말기 보안)
정답 : 3번
설명 : 모든 단말기에는 최신 백신을 설치하여야 한다.
참고 : 국가정보보안기본지침 제74조
`)

  assert.equal(answers.size, 2)
  assert.equal(answers.get(1)?.correctAnswer, 3)
  assert.equal(answers.get(1)?.category, "비공개 업무자료 처리")
  assert.equal(answers.get(1)?.explanation, "")
  assert.match(answers.get(1)?.sourceReference ?? "", /제66조/)
  assert.equal(answers.get(2)?.correctAnswer, 2)
  assert.match(answers.get(2)?.explanation ?? "", /최신 백신/)
})

test("조합형 문제의 조건 목록과 최종 보기를 구분한다", () => {
  const [question] = mergeQuestionAndAnswerTexts(
    `
1. 적절한 처리 방법을 모두 고르시오.
가 . 내부망 PC에서 작성한다.
나 . 승인된 저장매체에 저장한다.
다 . 외부 메일로 전송한다.
(1) 가
(2) 가, 나
(3) 나, 다
(4) 가, 나, 다
`,
    `
1.(자료 처리)
정답 : 2번
설명 : 승인된 환경을 사용해야 한다.
참고 : 보안지침 제1조
`,
  )

  assert.equal(question.options.length, 4)
  assert.deepEqual(question.options, ["가", "가, 나", "나, 다", "가, 나, 다"])
  assert.match(question.prompt, /가\. 내부망 PC/)
  assert.equal(question.correctAnswer, 1)
  assert.equal(question.category, "자료 처리")
  assert.equal(question.sourceReference, "보안지침 제1조")
})

test("번호 체계가 다른 두 문서는 순서로 보조 연결하고 검수를 요구한다", () => {
  const questions = mergeQuestionAndAnswerTexts(
    `1. 첫 질문\n① 하나\n② 둘\n2. 둘째 질문\n① 셋\n② 넷`,
    `101. ②\n102. ①`,
  )

  assert.equal(questions[0].correctAnswer, 1)
  assert.equal(questions[0].matchMethod, "order")
  assert.ok(questions[0].confidence < 0.75)
  assert.match(questions[0].warnings.join(" "), /순서로 연결/)
})
