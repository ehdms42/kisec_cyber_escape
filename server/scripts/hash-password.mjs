import { hashPassword } from "../security.mjs"

const password = process.env.ADMIN_PASSWORD
if (!password) {
  process.stderr.write("ADMIN_PASSWORD 환경변수가 필요합니다.\n")
  process.exit(1)
}
if (password.length < 12) {
  process.stderr.write("관리자 비밀번호는 12자 이상이어야 합니다.\n")
  process.exit(1)
}
process.stdout.write(`${await hashPassword(password)}\n`)
