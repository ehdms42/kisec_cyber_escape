import { useCallback, useEffect, useMemo, useState } from "react"
import {
  deleteAuditLog,
  listAuditLogs,
  purgeAuditLogs,
  type AuditLogEntry,
} from "../../admin/auditLogRepository"
import { useNotice } from "../../admin/useNotice"
import { useAdminDialog } from "./AdminDialogProvider"
import AdminIcon from "./AdminIcon"

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
  "admin_audit_log",
]

const ACTION_LABEL: Record<string, string> = {
  login: "로그인",
  logout: "로그아웃",
  create: "생성",
  update: "수정",
  delete: "삭제",
  purge: "로그 일괄 삭제",
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

const PURGE_OPTIONS = [
  { days: 30, label: "30일 이전" },
  { days: 90, label: "90일 이전" },
  { days: 180, label: "180일 이전" },
]

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

export default function AuditLogViewer() {
  const { confirm } = useAdminDialog()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useNotice()
  const [targetType, setTargetType] = useState("")
  const [adminLoginId, setAdminLoginId] = useState("")
  const [purgeDays, setPurgeDays] = useState(String(PURGE_OPTIONS[0].days))
  const [purging, setPurging] = useState(false)

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

  const logsByDay = useMemo(() => {
    const groups = new Map<string, AuditLogEntry[]>()
    for (const log of logs) {
      const key = dayKey(log.createdAt)
      const bucket = groups.get(key)
      if (bucket) bucket.push(log)
      else groups.set(key, [log])
    }
    return Array.from(groups.entries())
  }, [logs])

  const removeLog = async (log: AuditLogEntry) => {
    const confirmed = await confirm({
      title: "로그 삭제",
      message: "이 기록 1건을 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    })
    if (!confirmed) return
    try {
      await deleteAuditLog(log.id)
      setNotice("로그를 삭제했습니다.")
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "로그를 삭제하지 못했습니다.",
      )
    }
  }

  const purgeOld = async () => {
    const days = Number(purgeDays)
    const cutoffLabel =
      PURGE_OPTIONS.find((option) => option.days === days)?.label ??
      `${days}일 이전`
    const confirmed = await confirm({
      title: "오래된 로그 일괄 삭제",
      message: `${cutoffLabel} 로그를 전부 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      tone: "danger",
    })
    if (!confirmed) return
    setPurging(true)
    try {
      const cutoff = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString()
      const deletedCount = await purgeAuditLogs(cutoff)
      setNotice(`${deletedCount}건의 로그를 삭제했습니다.`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "로그를 삭제하지 못했습니다.",
      )
    } finally {
      setPurging(false)
    }
  }

  return (
    <main className="admin-content dashboard-page">
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

      <section className="dashboard-card">
        <header>
          <AdminIcon name="logs" />
          <div>
            <h3>작업 기록</h3>
            <small>최근 200건 · 날짜별로 묶어서 표시</small>
          </div>
          <span className="dashboard-card-header-trailing audit-log-purge">
            <select
              aria-label="삭제 기준"
              value={purgeDays}
              onChange={(event) => setPurgeDays(event.target.value)}
            >
              {PURGE_OPTIONS.map((option) => (
                <option value={option.days} key={option.days}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="dashboard-card-row-action is-danger"
              disabled={purging}
              onClick={() => void purgeOld()}
            >
              일괄 삭제
            </button>
          </span>
        </header>

        <div className="question-list-toolbar">
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
        </div>

        {loading ? (
          <p className="dashboard-empty-row">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <p className="dashboard-empty-row">기록된 로그가 없습니다.</p>
        ) : (
          logsByDay.map(([day, dayLogs]) => (
            <div className="audit-log-day-group" key={day}>
              <div className="audit-log-day-heading">
                <span>{day}</span>
                <b>{dayLogs.length}건</b>
              </div>
              <div className="ranking-table audit-log-table">
                {dayLogs.map((log) => (
                  <article key={log.id}>
                    <time dateTime={log.createdAt}>
                      {new Date(log.createdAt).toLocaleString("ko-KR")}
                    </time>
                    <span>
                      <strong>
                        {log.adminDisplayName || log.adminLoginId}
                      </strong>
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
                    <button
                      type="button"
                      className="dashboard-card-row-action is-danger"
                      onClick={() => void removeLog(log)}
                    >
                      삭제
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  )
}
