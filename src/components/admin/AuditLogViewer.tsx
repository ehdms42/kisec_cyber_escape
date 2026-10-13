import { useCallback, useEffect, useState } from "react"
import {
  listAuditLogs,
  type AuditLogEntry,
} from "../../admin/auditLogRepository"

const TARGET_TYPE_OPTIONS = [
  "question",
  "document",
  "institution",
  "campaign",
  "participant",
  "attempt",
  "prize_award",
  "admin_account",
  "admin_session",
  "game_settings",
]

const ACTION_LABEL: Record<string, string> = {
  login: "로그인",
  logout: "로그아웃",
  create: "생성",
  update: "수정",
  delete: "삭제",
  bulk_create: "일괄 생성",
  legacy_sync: "기존 문제 동기화",
  upload: "파일 업로드",
  status_change: "상태 변경",
  leaderboard_visibility_change: "리더보드 공개 설정 변경",
  import: "일괄 등록",
  select_winner: "1위 선정",
  update_prize_award: "상품 지급 상태 변경",
  attempt_resume: "응시 재개",
  attempt_void: "응시 무효화",
  attempt_reset: "응시 초기화",
}

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [targetType, setTargetType] = useState("")
  const [adminLoginId, setAdminLoginId] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setLogs(
        await listAuditLogs({
          targetType: targetType || undefined,
          adminLoginId: adminLoginId.trim() || undefined,
          limit: 200,
        }),
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "운영 로그를 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [targetType, adminLoginId])

  useEffect(() => void refresh(), [refresh])

  return (
    <main className="admin-content">
      <section className="admin-page-heading">
        <div>
          <h2>운영 로그</h2>
          <p>로그인, 콘텐츠 변경, 점수 조정 등 관리자 작업 기록입니다.</p>
        </div>
      </section>

      {notice && (
        <button
          className="admin-notice"
          type="button"
          onClick={() => setNotice("")}
        >
          {notice}
          <span>닫기</span>
        </button>
      )}

      <section className="admin-toolbar">
        <input
          value={adminLoginId}
          onChange={(event) => setAdminLoginId(event.target.value)}
          placeholder="관리자 아이디로 검색"
          aria-label="관리자 아이디 검색"
        />
        <select
          value={targetType}
          onChange={(event) => setTargetType(event.target.value)}
          aria-label="대상 종류 필터"
        >
          <option value="">전체 종류</option>
          {TARGET_TYPE_OPTIONS.map((type) => (
            <option value={type} key={type}>
              {type}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void refresh()}>
          검색
        </button>
      </section>

      <section className="admin-question-section ranking-table-panel">
        <div className="ranking-table audit-log-table">
          {loading ? (
            <p className="admin-empty">불러오는 중…</p>
          ) : logs.length === 0 ? (
            <p className="admin-empty">기록된 로그가 없습니다.</p>
          ) : (
            logs.map((log) => (
              <article key={log.id}>
                <time dateTime={log.createdAt}>
                  {new Date(log.createdAt).toLocaleString("ko-KR")}
                </time>
                <span>
                  <strong>{log.adminDisplayName || log.adminLoginId}</strong>
                  <small>@{log.adminLoginId}</small>
                </span>
                <em>{ACTION_LABEL[log.action] ?? log.action}</em>
                <span>
                  <small>
                    {log.targetType}
                    {log.targetId ? ` · ${log.targetId}` : ""}
                  </small>
                  {log.reason && <small>사유: {log.reason}</small>}
                </span>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}
