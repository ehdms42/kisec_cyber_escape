import { createClient } from "@supabase/supabase-js"

const url = process.env.LOAD_TEST_SUPABASE_URL?.trim()
const key = process.env.LOAD_TEST_SUPABASE_KEY?.trim()
const campaignToken = process.env.LOAD_TEST_CAMPAIGN_TOKEN?.trim()
const confirmed =
  process.env.LOAD_TEST_CONFIRM === "I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED"
const users = Math.min(
  Math.max(Number(process.env.LOAD_TEST_USERS) || 10, 1),
  200,
)
const answersPerUser = Math.min(
  Math.max(Number(process.env.LOAD_TEST_ANSWERS) || 3, 1),
  30,
)

if (!url || !key || !campaignToken || !confirmed) {
  console.error(`
실시간 부하 테스트 설정이 필요합니다.

LOAD_TEST_SUPABASE_URL=https://프로젝트.supabase.co
LOAD_TEST_SUPABASE_KEY=게시가능키
LOAD_TEST_CAMPAIGN_TOKEN=테스트전용배포토큰
LOAD_TEST_USERS=10
LOAD_TEST_ANSWERS=3
LOAD_TEST_CONFIRM=I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED

반드시 운영 배포가 아닌 테스트 전용 배포에서 실행하세요.
`)
  process.exit(1)
}

const levels = ["beginner", "intermediate", "advanced"]
const latencies = []
let realtimeEvents = 0
let failedRequests = 0
const runId = Date.now().toString(36)

function percentile(values, ratio) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]
}

async function timedRpc(client, name, params) {
  const started = performance.now()
  const response = await client.rpc(name, params)
  latencies.push(performance.now() - started)
  if (response.error) {
    failedRequests += 1
    throw response.error
  }
  return response.data
}

const campaignClient = createClient(url, key)
const campaignRows = await timedRpc(campaignClient, "get_campaign_public", {
  p_public_token: campaignToken,
})
const campaignId = campaignRows?.[0]?.campaign_id
if (!campaignId) throw new Error("테스트 배포를 찾지 못했습니다.")

const questionRows = await timedRpc(campaignClient, "get_published_questions", {
  p_limit: answersPerUser,
})
if (!Array.isArray(questionRows) || questionRows.length < answersPerUser) {
  throw new Error(`공개 문제가 ${answersPerUser}개 이상 필요합니다.`)
}

async function createVirtualUser(index) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const channel = client.channel(`load-${runId}-${index}`).on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "live_leaderboard_entries",
      filter: `campaign_id=eq.${campaignId}`,
    },
    () => {
      realtimeEvents += 1
    },
  )

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${index + 1}번 실시간 연결 시간 초과`)),
      10_000,
    )
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout)
        resolve()
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout)
        reject(new Error(`${index + 1}번 실시간 연결 실패: ${status}`))
      }
    })
  })

  const session = await timedRpc(client, "start_or_resume_attempt", {
    p_public_token: campaignToken,
    p_participant_code: `load-${runId}-${index}`,
    p_nickname: `부하시험${String(index + 1).padStart(3, "0")}`,
    p_department: "부하 테스트",
    p_security_level: levels[index % levels.length],
  })

  return { client, channel, session }
}

console.log(`가상 참가자 ${users}명 연결을 시작합니다.`)
const virtualUsers = await Promise.all(
  Array.from({ length: users }, (_, index) => createVirtualUser(index)),
)

console.log(`각 참가자가 ${answersPerUser}개 답안을 서버에 제출합니다.`)
await Promise.all(
  virtualUsers.map(async ({ client, session }, userIndex) => {
    for (let index = 0; index < answersPerUser; index += 1) {
      const question = questionRows[index]
      await timedRpc(client, "record_attempt_answer", {
        p_attempt_id: session.attempt_id,
        p_resume_token: session.resume_token,
        p_question_ordinal: question.ordinal,
        p_selected_answer: userIndex % question.options.length,
      })
      await new Promise((resolve) =>
        setTimeout(resolve, 80 + (userIndex % 5) * 20),
      )
    }
  }),
)

await new Promise((resolve) => setTimeout(resolve, 1200))

for (const { client, channel } of virtualUsers) {
  await client.removeChannel(channel)
}

console.log("")
console.log("실시간 부하 테스트 결과")
console.log(`- 참가자: ${users}명`)
console.log(`- 답안 요청: ${users * answersPerUser}건`)
console.log(`- 실패 요청: ${failedRequests}건`)
console.log(`- 수신 실시간 이벤트: ${realtimeEvents}건`)
console.log(
  `- 요청 평균: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)}ms`,
)
console.log(`- 요청 p95: ${percentile(latencies, 0.95).toFixed(1)}ms`)
console.log(`- 요청 최대: ${Math.max(...latencies).toFixed(1)}ms`)

if (failedRequests > 0) process.exitCode = 1
