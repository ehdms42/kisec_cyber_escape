import { useCallback, useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import {
  deleteParticipant,
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
} from "../../admin/institutionTypes"
import { useNotice } from "../../admin/useNotice"
import { subscribeToLeaderboard } from "../../game/liveLeaderboard"
import { useAdminDialog } from "./AdminDialogProvider"
import AdminIcon from "./AdminIcon"
import CampaignQuestionsTab from "./CampaignQuestionsTab"
import DepartmentCodesSection from "./DepartmentCodesSection"

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

export default function CampaignOperationsPanel({
  campaign,
  onClose,
  onUpdated,
}: {
  campaign: Campaign
  onClose: () => void
  onUpdated: (campaign: Campaign) => void
}) {
  const { prompt } = useAdminDialog()
  const [tab, setTab] =
    useState<"overview" | "questions" | "participants" | "monitor">("overview")
  const [notice, setNotice] = useNotice()
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
      await prompt({
        title: "배포 링크",
        message: "아래 링크를 직접 선택해서 복사하세요.",
        defaultValue: link,
        readOnly: true,
        cancelLabel: "닫기",
        confirmLabel: "닫기",
      })
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
            className={tab === "questions" ? "active" : ""}
            onClick={() => setTab("questions")}
          >
            문항 구성
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
              <span>참가자에게 결과 화면에서 순위 공개</span>
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

        {tab === "questions" && (
          <CampaignQuestionsTab
            campaign={campaign}
            onUpdated={onUpdated}
            setNotice={setNotice}
          />
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
  const { confirm } = useAdminDialog()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [departmentFilter, setDepartmentFilter] = useState("all")

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

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          participants
            .map((participant) => participant.department.trim())
            .filter((department) => department.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "ko")),
    [participants],
  )

  const visibleParticipants = useMemo(
    () =>
      participants.filter(
        (participant) =>
          departmentFilter === "all" ||
          participant.department.trim() === departmentFilter,
      ),
    [participants, departmentFilter],
  )

  const participantsByDepartment = useMemo(() => {
    const groups = new Map<string, Participant[]>()
    for (const participant of visibleParticipants) {
      const key = participant.department.trim() || "부서 미입력"
      const bucket = groups.get(key)
      if (bucket) bucket.push(participant)
      else groups.set(key, [participant])
    }
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "ko"),
    )
  }, [visibleParticipants])

  const removeParticipant = async (participant: Participant) => {
    const ok = await confirm({
      title: "참가자 삭제",
      message: `${participant.nickname}(${participant.department || "부서 미입력"}) 참가자를 삭제할까요? 답안·점수·순위 기록이 함께 삭제되며 되돌릴 수 없습니다. 같은 브라우저로 다시 입장하면 새로 응시할 수 있습니다.`,
      confirmLabel: "삭제",
      tone: "danger",
    })
    if (!ok) return
    setDeletingId(participant.id)
    try {
      await deleteParticipant(campaignId, participant.id)
      setNotice(`${participant.nickname} 참가자를 삭제했습니다.`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "참가자를 삭제하지 못했습니다.",
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="campaign-participants-tab">
      <DepartmentCodesSection campaignId={campaignId} setNotice={setNotice} />

      <div className="department-codes-head">
        <b>입장한 참가자</b>
      </div>

      {participants.length > 0 && (
        <div className="campaign-participants-filter">
          <select
            aria-label="부서 필터"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="all">전체 부서</option>
            {departments.map((department) => (
              <option value={department} key={department}>
                {department}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="admin-empty">불러오는 중…</p>
      ) : participants.length === 0 ? (
        <p className="admin-empty">아직 입장한 참가자가 없습니다.</p>
      ) : (
        participantsByDepartment.map(([department, departmentParticipants]) => (
          <div className="attempt-department-group" key={department}>
            <div className="attempt-department-heading">
              <span>{department}</span>
              <b>{departmentParticipants.length}명</b>
            </div>
            <div className="ranking-table">
              {departmentParticipants.map((participant) => (
                <article key={participant.id}>
                  <span>
                    <strong>{participant.nickname}</strong>
                  </span>
                  <em>
                    {participant.registeredBy === "csv"
                      ? "CSV 등록"
                      : participant.registeredBy === "admin"
                        ? "수동 등록"
                        : "코드 입장"}
                  </em>
                  <span>
                    {participant.attempt
                      ? `${participant.attempt.verifiedScore}점 · ${participant.attempt.answeredCount}문항`
                      : "미응시"}
                  </span>
                  <button
                    type="button"
                    className="participant-delete"
                    disabled={deletingId !== null}
                    onClick={() => void removeParticipant(participant)}
                  >
                    {deletingId === participant.id ? "삭제 중…" : "삭제"}
                  </button>
                </article>
              ))}
            </div>
          </div>
        ))
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
