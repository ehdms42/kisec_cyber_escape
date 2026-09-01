import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import express from "express"
import helmet from "helmet"
import multer from "multer"
import { createDataStore } from "./data.mjs"
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
const port = Number(process.env.API_PORT || 8787)
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

function requireAdmin(req, res, next) {
  const session = sessionFromRequest(req)
  if (!session) {
    res.status(401).json({ message: "관리자 로그인이 필요합니다." })
    return
  }
  req.adminSession = session
  next()
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

  const passwordMatches = await verifyPassword(password, passwordHash)
  if (!passwordMatches || requestedId !== adminId) {
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
  const session = createSession(sessionSecret, adminId, sessionTtlSeconds)
  setSessionCookie(res, session.token)
  res.json({ userId: adminId, csrfToken: session.csrfToken })
})

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({
    userId: req.adminSession.sub,
    csrfToken: req.adminSession.csrf,
  })
})

app.post(
  "/api/admin/logout",
  requireAdmin,
  requireMutationProtection,
  (_req, res) => {
    clearSessionCookie(res)
    res.status(204).end()
  },
)

app.get("/api/admin/questions", requireAdmin, async (_req, res) => {
  res.json(await store.listQuestions())
})

app.post(
  "/api/admin/questions",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.status(201).json(await store.saveQuestion(req.body))
  },
)

app.post(
  "/api/admin/questions/bulk",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.status(201).json(await store.createQuestions(req.body?.questions))
  },
)

app.put(
  "/api/admin/questions/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.json(await store.saveQuestion(req.body, req.params.id))
  },
)

app.delete(
  "/api/admin/questions/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.deleteQuestion(req.params.id)
    res.status(204).end()
  },
)

app.post(
  "/api/admin/documents",
  requireAdmin,
  requireMutationProtection,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "업로드할 파일이 없습니다." })
      return
    }
    const extension = path.extname(req.file.originalname).toLowerCase()
    if (![".pdf", ".hwp", ".hwpx"].includes(extension)) {
      res
        .status(415)
        .json({ message: "PDF, HWP, HWPX 파일만 업로드할 수 있습니다." })
      return
    }
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
    res
      .status(201)
      .json(await store.registerDocument(req.file, { role, pairId }))
  },
)

app.patch(
  "/api/admin/documents/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.updateDocument(req.params.id, req.body)
    res.status(204).end()
  },
)

app.get("/api/admin/institutions", requireAdmin, async (_req, res) => {
  res.json(await store.listInstitutions())
})

app.post(
  "/api/admin/institutions",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.status(201).json(await store.saveInstitution(req.body))
  },
)

app.put(
  "/api/admin/institutions/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.json(await store.saveInstitution(req.body, req.params.id))
  },
)

app.delete(
  "/api/admin/institutions/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.deleteInstitution(req.params.id)
    res.status(204).end()
  },
)

app.get("/api/admin/campaigns", requireAdmin, async (_req, res) => {
  res.json(await store.listCampaigns())
})

app.post(
  "/api/admin/campaigns",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.status(201).json(await store.saveCampaign(req.body))
  },
)

app.put(
  "/api/admin/campaigns/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    res.json(await store.saveCampaign(req.body, req.params.id))
  },
)

app.delete(
  "/api/admin/campaigns/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.deleteCampaign(req.params.id)
    res.status(204).end()
  },
)

app.get("/api/admin/attempts", requireAdmin, async (_req, res) => {
  res.json(await store.listAttempts())
})

app.patch(
  "/api/admin/attempts/:id",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.adjustAttempt(req.params.id, req.body)
    res.status(204).end()
  },
)

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
  requireMutationProtection,
  async (req, res) => {
    res.json(await store.selectCampaignWinner(req.params.id))
  },
)

app.patch(
  "/api/admin/campaigns/:id/prize-award",
  requireAdmin,
  requireMutationProtection,
  async (req, res) => {
    await store.updatePrizeAward(req.params.id, req.body)
    res.status(204).end()
  },
)

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
