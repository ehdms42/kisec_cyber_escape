import assert from "node:assert/strict"
import test from "node:test"
import {
  createSession,
  hashPassword,
  normalizeAdminId,
  parseCookies,
  verifyCsrf,
  verifyPassword,
  verifySession,
} from "./security.mjs"

const SECRET = "test-session-secret-that-is-long-enough"

test("관리자 비밀번호는 평문 없이 검증한다", async () => {
  const encoded = await hashPassword("Strong!Password2026")
  assert.equal(await verifyPassword("Strong!Password2026", encoded), true)
  assert.equal(await verifyPassword("wrong-password", encoded), false)
  assert.equal(encoded.includes("Strong!Password2026"), false)
})

test("서명된 세션과 CSRF 토큰만 허용한다", () => {
  const created = createSession(SECRET, "kisec-admin", 60)
  const session = verifySession(SECRET, created.token)

  assert.equal(session?.sub, "kisec-admin")
  assert.equal(verifyCsrf(session, created.csrfToken), true)
  assert.equal(verifyCsrf(session, "tampered"), false)
  assert.equal(verifySession(SECRET, `${created.token}tampered`), null)
})

test("만료 세션과 잘못된 쿠키도 안전하게 거부한다", () => {
  const expired = createSession(SECRET, "kisec-admin", -1)
  assert.equal(verifySession(SECRET, expired.token), null)
  assert.deepEqual(parseCookies("broken=%E0%A4%A; ok=value"), {
    broken: "%E0%A4%A",
    ok: "value",
  })
})

test("관리자 아이디를 비교 전에 정규화한다", () => {
  assert.equal(normalizeAdminId("  KISEC-ADMIN  "), "kisec-admin")
})
