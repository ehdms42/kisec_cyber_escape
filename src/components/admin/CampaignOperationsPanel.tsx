import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  importParticipants,
  listCampaignLiveAttempts,
  listParticipants,
  updateCampaignLeaderboardVisibility,
  updateCampaignStatus,
} from "../../admin/institutionRepository"
import type {
  Campaign,
  CampaignStatus,
  LiveAttemptEntry,
  Participant,
  ParticipantImportResult,
} from "../../admin/institutionTypes"
import { subscribeToLeaderboard } from "../../game/liveLeaderboard"
import AdminIcon from "./AdminIcon"

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "준비 중",
  open: "입장 가능",
  in_progress: "진행 중",
  paused: "일시정지",
  closed: "종료",
  finalized: "결과 확정",
  cancelled: "취소됨",
}

const STATUS_TRANSITIONS: Record<CampaignStatus, {
  to: CampaignStatus
  label: string
}[]> = {
  draft: [
    { to: "open", label: "입장 허용" },
    { to: "cancelled", label: "취소" },
  ],
  open: [
    { to: "in_progress", label: "게임 시작" },
    { to: "closed", label: "종료" },
    { to: "cancelled", label: "취소" },
  ],
  in_progress: [
    { to: "paused", label: "일시정지" },
    { to: "closed", label: "종료" },
  ],
  paused: [
    { to: "in_progress", label: "재개" },
    { to: "closed", label: "종료" },
  ],
  closed: [
    { to: "finalized", label: "결과 확정" },
    { to: "open", label: "다시 열기" },
  ],
  finalized: [],
  cancelled: [{ to: "draft", label: "준비 상태로" }],
}

interface ParticipantRow {
  nickname: string
  participantCode: string
  department: string
  contact: string
}

const HEADER_ALIASES: Record<string, keyof ParticipantRow> = {
  nickname: "nickname",
  닉네임: "nickname",
  이름: "nickname",
  participantcode: "participantCode",
  참여코드: "participantCode",
  코드: "participantCode",
  department: "department",
  부서: "department",
  소속: "department",
  contact: "contact",
  연락처: "contact",
  전화번호: "contact",
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += char
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()))
}

function parseParticipantCsv(text: string): ParticipantRow[] {
  const rows = parseCsvRows(text.replace(/^﻿/, ""))
  if (!rows.length) return []
  const header = rows[0].map((cell) =>
    cell.trim().toLowerCase().replace(/\s+/g, ""),
  )
  const mappedKeys = header.map((cell) => HEADER_ALIASES[cell] ?? null)
  const hasHeader = mappedKeys.some(Boolean)
  const dataRows = hasHeader ? rows.slice(1) : rows
  const keys = hasHeader
    ? mappedKeys
    : ["nickname", "participantCode", "department", "contact"] as const
  return dataRows.map((cells) => {
    const entry: Partial<ParticipantRow> = {}
    keys.forEach((key, index) => {
      if (key) entry[key] = (cells[index] ?? "").trim()
    })
    return {
      nickname: entry.nickname ?? "",
      participantCode: entry.participantCode ?? "",
      department: entry.department ?? "",
      contact: entry.contact ?? "",
    }
  })
}

export default function CampaignOperationsPanel({
  campaign,
  onClose,
  onUpdated,
}: {
  campaign: Campaign
  onClose: () => void
  onUpdated: (campaign: Campaign) => void
}) {
  const [tab, setTab] = useState<"overview" | "participants" | "monitor">(
    "overview",
  )
  const [notice, setNotice] = useState("")
  const [working, setWorking] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState("")
  const link = `${window.location.origin}/?campaign=${campaign.publicToken}`

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(link, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [link])

  const transition = async (to: CampaignStatus) => {
    setWorking(true)
    try {
      const updated = await updateCampaignStatus(campaign.id, to)
      onUpdated(updated)
      setNotice(`세션 상태를 "${STATUS_LABEL[to]}"(으)로 변경했습니다.`)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "상태를 변경하지 못했습니다.",
      )
    } finally {
      setWorking(false)
    }
  }

  const toggleLeaderboardVisible = async () => {
    setWorking(true)
    try {
      const updated = await updateCampaignLeaderboardVisibility(
        campaign.id,
        !campaign.leaderboardVisible,
      )
      onUpdated(updated)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "리더보드 공개 설정을 변경하지 못했습니다.",
      )
    } finally {
      setWorking(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setNotice("배포 링크를 복사했습니다.")
    } catch {
      window.prompt("아래 배포 링크를 복사하세요.", link)
    }
  }

  return (
    <div className="admin-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="admin-editor campaign-operations-panel"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{campaign.title} 운영</h2>
            <small>{campaign.institutionName}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

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

        <nav className="campaign-operations-tabs">
          <button
            type="button"
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            운영
          </button>
          <button
            type="button"
            className={tab === "participants" ? "active" : ""}
            onClick={() => setTab("participants")}
          >
            참가자
          </button>
          <button
            type="button"
            className={tab === "monitor" ? "active" : ""}
            onClick={() => setTab("monitor")}
          >
            실시간 모니터링
          </button>
        </nav>

        {tab === "overview" && (
          <section className="campaign-operations-overview">
            <div className="campaign-status-row">
              <span className={`admin-status-badge status-${campaign.status}`}>
                {STATUS_LABEL[campaign.status]}
              </span>
              {STATUS_TRANSITIONS[campaign.status].map((option) => (
                <button
                  key={option.to}
                  type="button"
                  disabled={working}
                  onClick={() => transition(option.to)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="admin-check-row">
              <input
                type="checkbox"
                checked={campaign.leaderboardVisible}
                disabled={working}
                onChange={toggleLeaderboardVisible}
              />
              <span>참가자에게 실시간 리더보드 공개</span>
            </label>

            <div className="campaign-qr-block">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="배포 링크 QR 코드"
                  width={160}
                  height={160}
                />
              )}
              <div>
                <code>{link}</code>
                <button
                  type="button"
                  className="admin-action-with-icon"
                  onClick={copyLink}
                >
                  <AdminIcon name="qrcode" />
                  링크 복사
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === "participants" && (
          <ParticipantsTab campaignId={campaign.id} setNotice={setNotice} />
        )}

        {tab === "monitor" && (
          <MonitorTab campaignId={campaign.id} setNotice={setNotice} />
        )}

        <footer>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  )
}

function ParticipantsTab({
  campaignId,
  setNotice,
}: {
  campaignId: string
  setNotice: (message: string) => void
}) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<ParticipantImportResult[]>(
    [],
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [manualNickname, setManualNickname] = useState("")
  const [manualCode, setManualCode] = useState("")
  const [manualDepartment, setManualDepartment] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setParticipants(await listParticipants(campaignId))
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "참가자 목록을 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [campaignId, setNotice])

  useEffect(() => void refresh(), [refresh])

  const handleFile = async (file: File) => {
    const text = await file.text()
    const rows = parseParticipantCsv(text)
    if (!rows.length) {
      setNotice("CSV 파일에서 참가자 정보를 찾지 못했습니다.")
      return
    }
    setImporting(true)
    try {
      const results = await importParticipants(campaignId, rows)
      setImportResults(results)
      const registered = results.filter(
        (item) => item.status === "registered",
      ).length
      setNotice(`${registered}명을 등록했습니다. (총 ${results.length}행 처리)`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "참가자를 등록하지 못했습니다.",
      )
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const addManual = async () => {
    if (manualNickname.trim().length < 2 || manualCode.trim().length < 4) {
      setNotice("닉네임(2자 이상)과 참여 코드(4자 이상)를 입력해 주세요.")
      return
    }
    setImporting(true)
    try {
      const results = await importParticipants(campaignId, [
        {
          nickname: manualNickname.trim(),
          participantCode: manualCode.trim(),
          department: manualDepartment.trim(),
        },
      ])
      const [result] = results
      setNotice(result?.message ?? "참가자를 등록했습니다.")
      setManualNickname("")
      setManualCode("")
      setManualDepartment("")
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "참가자를 등록하지 못했습니다.",
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="campaign-participants-tab">
      <div className="admin-file-drop campaign-csv-drop">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <b>CSV로 참가자 일괄 등록</b>
        <span>
          닉네임, 참여코드, 부서, 연락처 열을 포함한 CSV 파일을 선택하세요.
        </span>
      </div>

      {importResults.length > 0 && (
        <div className="admin-import-summary">
          <span>
            등록{" "}
            <b>
              {
                importResults.filter((item) => item.status === "registered")
                  .length
              }
            </b>
          </span>
          <span>
            중복{" "}
            <b>
              {
                importResults.filter((item) => item.status === "duplicate")
                  .length
              }
            </b>
          </span>
          <span>
            건너뜀{" "}
            <b>
              {importResults.filter((item) => item.status === "skipped").length}
            </b>
          </span>
        </div>
      )}

      <div className="campaign-manual-add">
        <input
          value={manualNickname}
          onChange={(event) => setManualNickname(event.target.value)}
          placeholder="닉네임"
        />
        <input
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="참여 코드"
        />
        <input
          value={manualDepartment}
          onChange={(event) => setManualDepartment(event.target.value)}
          placeholder="부서 (선택)"
        />
        <button
          type="button"
          className="admin-primary"
          disabled={importing}
          onClick={addManual}
        >
          추가
        </button>
      </div>

      {loading ? (
        <p className="admin-empty">불러오는 중…</p>
      ) : participants.length === 0 ? (
        <p className="admin-empty">등록된 참가자가 없습니다.</p>
      ) : (
        <div className="ranking-table">
          {participants.map((participant) => (
            <article key={participant.id}>
              <span>
                <strong>{participant.nickname}</strong>
                <small>{participant.department || "부서 미입력"}</small>
              </span>
              <em>
                {participant.registeredBy === "csv"
                  ? "CSV 등록"
                  : participant.registeredBy === "admin"
                    ? "수동 등록"
                    : "본인 입장"}
              </em>
              <span>
                {participant.attempt
                  ? `${participant.attempt.verifiedScore}점 · ${participant.attempt.answeredCount}문항`
                  : "미응시"}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function MonitorTab({
  campaignId,
  setNotice,
}: {
  campaignId: string
  setNotice: (message: string) => void
}) {
  const [entries, setEntries] = useState<LiveAttemptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setEntries(await listCampaignLiveAttempts(campaignId))
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "실시간 현황을 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [campaignId, setNotice])

  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeToLeaderboard(
      campaignId,
      () => void refresh(),
      setConnected,
    )
    const interval = window.setInterval(() => void refresh(), 10_000)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [campaignId, refresh])

  const stalledCount = useMemo(
    () => entries.filter((entry) => entry.stalled).length,
    [entries],
  )

  return (
    <section className="campaign-monitor-tab">
      <p className="dashboard-neutral-note">
        {connected
          ? "실시간 연결됨"
          : "실시간 연결 대기 중 (10초마다 새로고침)"}
        {stalledCount > 0 && <b> · 정체 참가자 {stalledCount}명</b>}
      </p>
      {loading ? (
        <p className="admin-empty">불러오는 중…</p>
      ) : entries.length === 0 ? (
        <p className="admin-empty">진행 중인 참가자가 없습니다.</p>
      ) : (
        <div className="ranking-table">
          {entries.map((entry) => (
            <article
              key={entry.attemptId}
              className={entry.stalled ? "is-stalled" : ""}
            >
              <span>
                <strong>{entry.nickname}</strong>
                <small>
                  {entry.status === "completed" ? "완료" : "진행 중"}
                </small>
              </span>
              <span>
                {entry.verifiedScore}점 · {entry.answeredCount}문항
              </span>
              <em>{entry.stalled ? "정체" : ""}</em>
              <time dateTime={entry.lastSeenAt}>
                {Math.floor(entry.idleSeconds / 60)}분 전 활동
              </time>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
