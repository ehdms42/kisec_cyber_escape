import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import express from "express"
import helmet from "helmet"
import multer from "multer"
import { createDataStore, validateDocumentFile } from "./data.mjs"
import { extractDocument } from "./document-extraction.mjs"
import {
  createSession,
  normalizeAdminId,
  parseCookies,
  verifyCsrf,
  verifyPassword,
  verifySession,
} from "./security.mjs"

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === "production"
const port = Number(process.env.PORT || process.env.API_PORT || 8787)
const adminId = normalizeAdminId(process.env.ADMIN_LOGIN_ID)
const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? ""
const sessionSecret = process.env.SESSION_SECRET ?? ""
const sessionTtlSeconds = Number(process.env.SESSION_TTL_SECONDS || 28800)
const allowedOrigins = new Set(
  (process.env.APP_ORIGINS || "http://localhost:8443")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
)
const allowLocalData = !isProduction && process.env.ALLOW_LOCAL_DATA === "true"
const cookieName = isProduction
  ? "__Host-kisec_admin_session"
  : "kisec_admin_session"

if (!adminId || !passwordHash || sessionSecret.length < 32) {
  throw new Error(
    "ADMIN_LOGIN_ID, ADMIN_PASSWORD_HASH, 32자 이상의 SESSION_SECRET가 필요합니다.",
  )
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT를 올바른 포트 번호로 설정해 주세요.")
}
if (
  !Number.isInteger(sessionTtlSeconds) ||
  sessionTtlSeconds < 300 ||
  sessionTtlSeconds > 86400
) {
  throw new Error(
    "SESSION_TTL_SECONDS는 300초 이상 86400초 이하로 설정해 주세요.",
  )
}
if (isProduction && !process.env.APP_ORIGINS) {
  throw new Error("운영 환경에는 APP_ORIGINS 설정이 필요합니다.")
}
if (isProduction && process.env.ALLOW_LOCAL_DATA === "true") {
  throw new Error("운영 환경에서는 로컬 데이터 모드를 사용할 수 없습니다.")
}

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      )
    : null

if (isProduction && !supabase) {
  throw new Error(
    "운영 환경에는 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
  )
}

const store = createDataStore({
  supabase,
  allowLocalData,
  dataDirectory: path.join(serverDirectory, ".data"),
})
const app = express()
const loginAttempts = new Map()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
})
const documentExtractionOptions = {
  clova: {
    invokeUrl: process.env.CLOVA_OCR_INVOKE_URL?.trim() ?? "",
    secret: process.env.CLOVA_OCR_SECRET?.trim() ?? "",
  },
}

app.disable("x-powered-by")
if (isProduction) app.set("trust proxy", 1)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
)
app.use(express.json({ limit: "5mb", strict: true }))

function requestOriginAllowed(req) {
  const origin = req.get("origin")
  return !origin || allowedOrigins.has(origin)
}

function sessionFromRequest(req) {
  const token = parseCookies(req.get("cookie"))[cookieName]
  return verifySession(sessionSecret, token)
}

// 환경변수 기반 계정은 잠금 방지를 위한 "부트스트랩 최고 관리자"로 항상 유지하고,
// 그 외 로그인 ID는 admin_accounts 테이블에서 역할(role)을 조회한다.
async function resolveAdminIdentity(loginId) {
  if (loginId === adminId) {
    return { loginId: adminId, displayName: "최고 관리자", roles: ["super"] }
  }
  const account = await store.findAdminAccountByLoginId(loginId)
  if (!account || !account.active) return null
  return {
    loginId: account.login_id,
    displayName: account.display_name,
    roles: Array.isArray(account.roles) ? account.roles : [],
  }
}

async function requireAdmin(req, res, next) {
  try {
    const session = sessionFromRequest(req)
    if (!session || (await store.isAdminSessionRevoked(session.nonce))) {
      res.status(401).json({ message: "관리자 로그인이 필요합니다." })
      return
    }
    const identity = await resolveAdminIdentity(session.sub)
    if (!identity) {
      res.status(401).json({ message: "관리자 로그인이 필요합니다." })
      return
    }
    req.adminSession = session
    req.adminIdentity = identity
    next()
  } catch (error) {
    next(error)
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const identity = req.adminIdentity
    if (!identity || !roles.some((role) => identity.roles.includes(role))) {
      res.status(403).json({ message: "이 작업을 수행할 권한이 없습니다." })
      return
    }
    next()
  }
}

function requireMutationProtection(req, res, next) {
  if (!requestOriginAllowed(req)) {
    res.status(403).json({ message: "허용되지 않은 요청 출처입니다." })
    return
  }
  if (!verifyCsrf(req.adminSession, req.get("x-csrf-token"))) {
    res.status(403).json({ message: "보안 토큰이 올바르지 않습니다." })
    return
  }
  next()
}

function auditContext(req) {
  return {
    adminLoginId: req.adminSession?.sub ?? "",
    adminDisplayName: req.adminIdentity?.displayName ?? "",
    roles: req.adminIdentity?.roles ?? [],
    ip: req.ip,
  }
}

async function recordAudit(req, fields) {
  await store.recordAuditLog({ ...auditContext(req), ...fields })
}

function setSessionCookie(res, token) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: sessionTtlSeconds * 1000,
  })
}

function clearSessionCookie(res) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  })
}

function loginRateKey(req, id) {
  return req.ip || id
}

function loginBlocked(key) {
  const record = loginAttempts.get(key)
  if (!record) return false
  if (record.resetAt <= Date.now()) {
    loginAttempts.delete(key)
    return false
  }
  return record.count >= 5
}

function registerLoginFailure(key) {
  const current = loginAttempts.get(key)
  loginAttempts.set(key, {
    count: (current?.count ?? 0) + 1,
    resetAt: current?.resetAt ?? Date.now() + 15 * 60 * 1000,
  })
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    database: supabase ? "supabase" : allowLocalData ? "local" : "missing",
  })
})

app.post("/api/admin/login", async (req, res) => {
  if (!requestOriginAllowed(req)) {
    res.status(403).json({ message: "허용되지 않은 요청 출처입니다." })
    return
  }
  const requestedId = normalizeAdminId(req.body?.id)
  const password = String(req.body?.password ?? "")
  const rateKey = loginRateKey(req, requestedId)
  if (loginBlocked(rateKey)) {
    res.status(429).json({
      message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    })
    return
  }

  let authenticated = false
  let resolvedLoginId = null
  if (requestedId === adminId) {
    authenticated = await verifyPassword(password, passwordHash)
    resolvedLoginId = adminId
  } else if (requestedId) {
    const account = await store.findAdminAccountByLoginId(requestedId)
    if (account && account.active) {
      authenticated = await verifyPassword(password, account.password_hash)
      resolvedLoginId = account.login_id
    }
  }

  if (!authenticated) {
    registerLoginFailure(rateKey)
    await new Promise((resolve) =>
      setTimeout(resolve, 250 + Math.random() * 250),
    )
    res
      .status(401)
      .json({ message: "관리자 아이디 또는 비밀번호가 올바르지 않습니다." })
    return
  }

  loginAttempts.delete(rateKey)
  await store.touchAdminAccountLogin(resolvedLoginId).catch(() => undefined)
  const session = createSession(
    sessionSecret,
    resolvedLoginId,
    sessionTtlSeconds,
  )
  setSessionCookie(res, session.token)
  const identity = await resolveAdminIdentity(resolvedLoginId)
  await store.recordAuditLog({
    adminLoginId: resolvedLoginId,
    adminDisplayName: identity?.displayName ?? "",
    roles: identity?.roles ?? [],
    action: "login",
    targetType: "admin_session",
    targetId: resolvedLoginId,
    ip: req.ip,
  })
  res.json({
    userId: resolvedLoginId,
    csrfToken: session.csrfToken,
    roles: identity?.roles ?? [],
    displayName: identity?.displayName ?? "",
  })
})

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({
    userId: req.adminSession.sub,
    csrfToken: req.adminSession.csrf,
    roles: req.adminIdentity.roles,
    displayName: req.adminIdentity.displayName,
  })
})

app.post(
  "/api/admin/logout",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.revokeAdminSession(
      req.adminSession.nonce,
      new Date(req.adminSession.exp * 1000).toISOString(),
    )
    await recordAudit(req, {
      action: "logout",
      targetType: "admin_session",
      targetId: req.adminSession.sub,
    })
    clearSessionCookie(res)
    res.status(204).end()
  },
)

// ---- 대시보드 ------------------------------------------------------------

app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
  res.json(await store.getDashboardSummary())
})

// ---- 게임 설정(시나리오) ---------------------------------------------------

app.get("/api/admin/game-settings", requireAdmin, async (_req, res) => {
  res.json(await store.getGameSettings())
})

app.patch(
  "/api/admin/game-settings",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getGameSettings()
    const after = await store.updateGameSettings(req.body, req.adminSession.sub)
    await recordAudit(req, {
      action: "update",
      targetType: "game_settings",
      targetId: "singleton",
      before,
      after,
    })
    res.json(after)
  },
)

// ---- 문제 및 힌트 ----------------------------------------------------------

app.get("/api/admin/questions", requireAdmin, async (_req, res) => {
  res.json(await store.listQuestions())
})

app.post(
  "/api/admin/questions",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.saveQuestion(req.body)
    await recordAudit(req, {
      action: "create",
      targetType: "question",
      targetId: after.id,
      after,
    })
    res.status(201).json(after)
  },
)

app.post(
  "/api/admin/questions/bulk",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.createQuestions(req.body?.questions)
    await recordAudit(req, {
      action: "bulk_create",
      targetType: "question",
      targetId: null,
      after: { count: after.length },
    })
    res.status(201).json(after)
  },
)

app.post(
  "/api/admin/questions/legacy-sync",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.createLegacyQuestions(req.body?.questions)
    await recordAudit(req, {
      action: "legacy_sync",
      targetType: "question",
      targetId: null,
      after: { count: after.length },
    })
    res.status(201).json(after)
  },
)

app.put(
  "/api/admin/questions/:id",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getQuestionById(req.params.id)
    const after = await store.saveQuestion(req.body, req.params.id)
    await recordAudit(req, {
      action: "update",
      targetType: "question",
      targetId: req.params.id,
      before,
      after,
    })
    res.json(after)
  },
)

app.delete(
  "/api/admin/questions/:id",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getQuestionById(req.params.id)
    await store.deleteQuestion(req.params.id)
    await recordAudit(req, {
      action: "delete",
      targetType: "question",
      targetId: req.params.id,
      before,
    })
    res.status(204).end()
  },
)

app.post(
  "/api/admin/documents",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "업로드할 파일이 없습니다." })
      return
    }
    validateDocumentFile(req.file)
    const role = String(req.body?.role ?? "")
    const pairId = String(req.body?.pairId ?? "")
    if (!["question", "answer"].includes(role)) {
      res.status(400).json({ message: "문제지 또는 해답지 구분이 필요합니다." })
      return
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        pairId,
      )
    ) {
      res.status(400).json({ message: "문서 세트 식별자를 확인해 주세요." })
      return
    }
    const after = await store.registerDocument(req.file, { role, pairId })
    await recordAudit(req, {
      action: "upload",
      targetType: "document",
      targetId: after.id,
      after: { originalName: after.originalName, role },
    })
    res.status(201).json(after)
  },
)

app.post(
  "/api/admin/documents/extract",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "분석할 파일이 없습니다." })
      return
    }
    validateDocumentFile(req.file)
    const role = String(req.body?.role ?? "")
    if (!["question", "answer"].includes(role)) {
      res.status(400).json({ message: "문제지 또는 해답지 구분이 필요합니다." })
      return
    }
    res.json(
      await extractDocument(req.file, {
        role,
        ...documentExtractionOptions,
      }),
    )
  },
)

app.patch(
  "/api/admin/documents/:id",
  requireAdmin,
  requireRole("content", "super"),
  requireMutationProtection,
  async (req, res) => {
    await store.updateDocument(req.params.id, req.body)
    res.status(204).end()
  },
)

// ---- 기관 -----------------------------------------------------------------

app.get("/api/admin/institutions", requireAdmin, async (_req, res) => {
  res.json(await store.listInstitutions())
})

app.post(
  "/api/admin/institutions",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.saveInstitution(req.body)
    await recordAudit(req, {
      action: "create",
      targetType: "institution",
      targetId: after.id,
      after,
    })
    res.status(201).json(after)
  },
)

app.put(
  "/api/admin/institutions/:id",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getInstitutionById(req.params.id)
    const after = await store.saveInstitution(req.body, req.params.id)
    await recordAudit(req, {
      action: "update",
      targetType: "institution",
      targetId: req.params.id,
      before,
      after,
    })
    res.json(after)
  },
)

app.delete(
  "/api/admin/institutions/:id",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getInstitutionById(req.params.id)
    await store.deleteInstitution(req.params.id)
    await recordAudit(req, {
      action: "delete",
      targetType: "institution",
      targetId: req.params.id,
      before,
    })
    res.status(204).end()
  },
)

// ---- 세션(캠페인) ----------------------------------------------------------

app.get("/api/admin/campaigns", requireAdmin, async (_req, res) => {
  res.json(await store.listCampaigns())
})

app.post(
  "/api/admin/campaigns",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.saveCampaign(req.body)
    await recordAudit(req, {
      action: "create",
      targetType: "campaign",
      targetId: after.id,
      after,
    })
    res.status(201).json(after)
  },
)

app.put(
  "/api/admin/campaigns/:id",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getCampaignById(req.params.id)
    const after = await store.saveCampaign(req.body, req.params.id)
    await recordAudit(req, {
      action: "update",
      targetType: "campaign",
      targetId: req.params.id,
      before,
      after,
    })
    res.json(after)
  },
)

app.patch(
  "/api/admin/campaigns/:id/status",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getCampaignById(req.params.id)
    const after = await store.updateCampaignStatus(
      req.params.id,
      String(req.body?.status ?? ""),
    )
    await recordAudit(req, {
      action: "status_change",
      targetType: "campaign",
      targetId: req.params.id,
      reason: req.body?.reason ?? null,
      before: { status: before?.status },
      after: { status: after.status },
    })
    res.json(after)
  },
)

app.patch(
  "/api/admin/campaigns/:id/leaderboard-visibility",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.updateCampaignLeaderboardVisibility(
      req.params.id,
      Boolean(req.body?.visible),
    )
    await recordAudit(req, {
      action: "leaderboard_visibility_change",
      targetType: "campaign",
      targetId: req.params.id,
      after: { leaderboardVisible: after.leaderboardVisible },
    })
    res.json(after)
  },
)

app.delete(
  "/api/admin/campaigns/:id",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getCampaignById(req.params.id)
    await store.deleteCampaign(req.params.id)
    await recordAudit(req, {
      action: "delete",
      targetType: "campaign",
      targetId: req.params.id,
      before,
    })
    res.status(204).end()
  },
)

// ---- 참가자 ---------------------------------------------------------------

app.get(
  "/api/admin/campaigns/:id/participants",
  requireAdmin,
  requireRole("operations", "super"),
  async (req, res) => {
    res.json(await store.listParticipants(req.params.id))
  },
)

app.post(
  "/api/admin/campaigns/:id/participants/import",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const results = await store.importParticipants(
      req.params.id,
      req.body?.rows,
    )
    await recordAudit(req, {
      action: "import",
      targetType: "participant",
      targetId: req.params.id,
      after: {
        registered: results.filter((item) => item.status === "registered")
          .length,
        duplicate: results.filter((item) => item.status === "duplicate").length,
        skipped: results.filter((item) => item.status === "skipped").length,
      },
    })
    res.status(201).json(results)
  },
)

// ---- 실시간 모니터링 -------------------------------------------------------

app.get("/api/admin/campaigns/:id/live", requireAdmin, async (req, res) => {
  res.json(await store.listCampaignLiveAttempts(req.params.id))
})

// ---- 응시 기록 --------------------------------------------------------------

app.get("/api/admin/attempts", requireAdmin, async (_req, res) => {
  res.json(await store.listAttempts())
})

app.get("/api/admin/attempts/:id/answers", requireAdmin, async (req, res) => {
  res.json(await store.listAttemptAnswers(req.params.id))
})

app.patch(
  "/api/admin/attempts/:id",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    await store.adjustAttempt(req.params.id, req.body, req.adminSession.sub)
    await recordAudit(req, {
      action: `attempt_${req.body?.action ?? "adjust"}`,
      targetType: "attempt",
      targetId: req.params.id,
      reason: req.body?.reason ?? null,
    })
    res.status(204).end()
  },
)

// ---- 순위 및 상품 ----------------------------------------------------------

app.get("/api/admin/rankings", requireAdmin, async (req, res) => {
  const campaignId = String(req.query.campaignId ?? "").trim() || null
  res.json(await store.listRankings(campaignId))
})

app.get("/api/admin/prize-awards", requireAdmin, async (_req, res) => {
  res.json(await store.listPrizeAwards())
})

app.post(
  "/api/admin/campaigns/:id/winner",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.selectCampaignWinner(
      req.params.id,
      req.adminSession.sub,
    )
    await recordAudit(req, {
      action: "select_winner",
      targetType: "prize_award",
      targetId: req.params.id,
      after,
    })
    res.json(after)
  },
)

app.patch(
  "/api/admin/campaigns/:id/prize-award",
  requireAdmin,
  requireRole("operations", "super"),
  requireMutationProtection,
  async (req, res) => {
    await store.updatePrizeAward(req.params.id, req.body, req.adminSession.sub)
    await recordAudit(req, {
      action: "update_prize_award",
      targetType: "prize_award",
      targetId: req.params.id,
      after: { status: req.body?.status, note: req.body?.note },
    })
    res.status(204).end()
  },
)

// ---- 관리자 계정(RBAC) ------------------------------------------------------

app.get(
  "/api/admin/accounts",
  requireAdmin,
  requireRole("super"),
  async (_req, res) => {
    res.json(await store.listAdminAccounts())
  },
)

app.post(
  "/api/admin/accounts",
  requireAdmin,
  requireRole("super"),
  requireMutationProtection,
  async (req, res) => {
    const after = await store.createAdminAccount(req.body, req.adminSession.sub)
    await recordAudit(req, {
      action: "create",
      targetType: "admin_account",
      targetId: after.id,
      after: { loginId: after.loginId, roles: after.roles },
    })
    res.status(201).json(after)
  },
)

app.patch(
  "/api/admin/accounts/:id",
  requireAdmin,
  requireRole("super"),
  requireMutationProtection,
  async (req, res) => {
    const before = await store.getAdminAccountById(req.params.id)
    const after = await store.updateAdminAccount(req.params.id, req.body)
    await recordAudit(req, {
      action: "update",
      targetType: "admin_account",
      targetId: req.params.id,
      before: before ? { roles: before.roles, active: before.active } : null,
      after: { roles: after.roles, active: after.active },
    })
    res.json(after)
  },
)

// ---- 운영 로그 --------------------------------------------------------------

app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
  res.json(
    await store.listAuditLogs({
      limit: req.query.limit,
      adminLoginId: req.query.adminLoginId
        ? String(req.query.adminLoginId)
        : undefined,
      targetType: req.query.targetType
        ? String(req.query.targetType)
        : undefined,
    }),
  )
})

app.use((_req, res) => {
  res.status(404).json({ message: "요청한 서버 기능을 찾을 수 없습니다." })
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "파일은 20MB 이하만 업로드할 수 있습니다."
        : "파일 업로드 요청을 확인해 주세요."
    res.status(400).json({ message })
    return
  }
  const status = Number(error?.status) || 500
  if (status >= 500) console.error(error)
  res.status(status).json({
    message: status >= 500 ? "서버 요청을 처리하지 못했습니다." : error.message,
  })
})

app.listen(port, "0.0.0.0", (error) => {
  if (error) {
    console.error("관리자 API 서버를 시작하지 못했습니다.", error)
    process.exitCode = 1
    return
  }
  console.log(
    `KISEC admin API listening on http://0.0.0.0:${port} (${
      supabase ? "Supabase" : "local data"
    })`,
  )
})
