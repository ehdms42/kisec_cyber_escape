import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback)
const SCRYPT_COST = 32768
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const SCRYPT_KEY_LENGTH = 64
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function digest(value) {
  return createHash("sha256").update(value).digest("base64url")
}

function decodeCookiePart(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(24)
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  })
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$")
}

export async function verifyPassword(password, encoded) {
  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    encoded.split("$")
  if (
    algorithm !== "scrypt" ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !salt ||
    !expected
  ) {
    return false
  }

  try {
    const derived = await scrypt(
      password,
      Buffer.from(salt, "base64url"),
      Buffer.from(expected, "base64url").length,
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelization),
        maxmem: SCRYPT_MAX_MEMORY,
      },
    )
    return safeEqual(Buffer.from(derived), Buffer.from(expected, "base64url"))
  } catch {
    return false
  }
}

export function createSession(secret, adminId, ttlSeconds) {
  const csrfToken = randomBytes(32).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      sub: adminId,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      csrf: csrfToken,
      nonce: randomBytes(16).toString("base64url"),
    }),
  ).toString("base64url")
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
  return { token: `${payload}.${signature}`, csrfToken }
}

export function verifySession(secret, token) {
  if (!token) return null
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra) return null
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
  if (!safeEqual(signature, expected)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (
      typeof session.sub !== "string" ||
      typeof session.exp !== "number" ||
      typeof session.csrf !== "string" ||
      typeof session.nonce !== "string" ||
      !session.nonce ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return session
  } catch {
    return null
  }
}

export function verifyCsrf(session, token) {
  return Boolean(token && safeEqual(digest(token), digest(session.csrf)))
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=")
        if (index < 0) return [part, ""]
        return [
          decodeCookiePart(part.slice(0, index)),
          decodeCookiePart(part.slice(index + 1)),
        ]
      }),
  )
}

export function normalizeAdminId(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
}
