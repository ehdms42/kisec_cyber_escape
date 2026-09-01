import { useCallback, useEffect, useMemo, useState } from "react"
import { listCampaigns } from "../../admin/institutionRepository"
import type { Campaign } from "../../admin/institutionTypes"
import {
  listPrizeAwards,
  listRankings,
  selectCampaignWinner,
  updatePrizeAward,
} from "../../admin/rankingRepository"
import type {
  PrizeAward,
  PrizeStatus,
  RankingEntry,
} from "../../admin/rankingTypes"
import AdminIcon from "./AdminIcon"

const PRIZE_STATUS_LABEL: Record<PrizeStatus, string> = {
  selected: "1위 선정",
  notified: "수상자 안내",
  delivered: "지급 완료",
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}시간 ${minutes}분 ${seconds}초`
    : `${minutes}분 ${seconds}초`
}

function csvValue(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

export default function RankingManagement() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [rankings, setRankings] = useState<RankingEntry[]>([])
  const [awards, setAwards] = useState<PrizeAward[]>([])
  const [campaignId, setCampaignId] = useState("")
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextCampaigns, nextRankings, nextAwards] = await Promise.all([
        listCampaigns(),
        listRankings(),
        listPrizeAwards(),
      ])
      setCampaigns(nextCampaigns)
      setRankings(nextRankings)
      setAwards(nextAwards)
      setCampaignId((current) =>
        nextCampaigns.some((campaign) => campaign.id === current)
          ? current
          : (nextCampaigns[0]?.id ?? ""),
      )
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "순위를 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void refresh(), [refresh])

  const selectedCampaign = campaigns.find(
    (campaign) => campaign.id === campaignId,
  )
  const entries = useMemo(
    () => rankings.filter((entry) => entry.campaignId === campaignId),
    [campaignId, rankings],
  )
  const award = awards.find((item) => item.campaignId === campaignId) ?? null
  const winnerChanged = Boolean(
    award && entries[0] && award.attemptId !== entries[0].attemptId,
  )
  const averageScore = entries.length
    ? (
        entries.reduce((total, entry) => total + entry.verifiedScore, 0) /
        entries.length
      ).toFixed(1)
    : "0"
  const fastestSeconds = entries.length
    ? Math.min(...entries.map((entry) => entry.elapsedSeconds))
    : null

  const selectWinner = async () => {
    if (!campaignId || !entries.length) return
    const winner = entries[0]
    if (
      !window.confirm(
        `${winner.nickname}님을 ${selectedCampaign?.title ?? "현재 배포"}의 1위로 선정할까요?`,
      )
    ) {
      return
    }
    setSaving(true)
    try {
      await selectCampaignWinner(campaignId)
      setNotice(`${winner.nickname}님을 1위 수상자로 선정했습니다.`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "1위를 선정하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  const changePrizeStatus = async (status: PrizeStatus) => {
    if (!award) return
    const note = window
      .prompt("상품 지급 메모를 입력하세요.", award.note)
      ?.trim()
    if (note === undefined) return
    setSaving(true)
    try {
      await updatePrizeAward(campaignId, status, note)
      setNotice(`상품 상태를 '${PRIZE_STATUS_LABEL[status]}'로 변경했습니다.`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "상품 상태를 저장하지 못했습니다.",
      )
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    if (!entries.length) return
    const header = [
      "순위",
      "기관",
      "배포",
      "요원명",
      "부서명",
      "검증 점수",
      "응답 문항",
      "소요 시간(초)",
      "완료 시각",
    ]
    const rows = entries.map((entry) => [
      entry.rank,
      entry.institutionName,
      entry.campaignTitle,
      entry.nickname,
      entry.department,
      entry.verifiedScore,
      entry.answeredCount,
      entry.elapsedSeconds,
      entry.completedAt,
    ])
    const csv = `\uFEFF${[header, ...rows]
      .map((row) => row.map(csvValue).join(","))
      .join("\n")}`
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${selectedCampaign?.institutionName ?? "기관"}-${selectedCampaign?.title ?? "순위"}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="admin-content ranking-admin-content">
      <section className="admin-page-heading ranking-heading">
        <div>
          <h2>탈출 순위</h2>
          <p>
            서버 검증 점수, 소요 시간, 완료 순서로 배포별 순위를 계산합니다.
          </p>
        </div>
        <div>
          <select
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            aria-label="배포 선택"
          >
            {campaigns.length === 0 && <option value="">배포 없음</option>}
            {campaigns.map((campaign) => (
              <option value={campaign.id} key={campaign.id}>
                {campaign.institutionName} · {campaign.title}
              </option>
            ))}
          </select>
          <button
            className="admin-action-with-icon"
            type="button"
            onClick={exportCsv}
            disabled={!entries.length}
          >
            <AdminIcon name="download" />
            CSV 내보내기
          </button>
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

      <section className="ranking-rule-note">
        <b>순위 기준</b>
        <span>① 정답 수가 많은 순</span>
        <span>② 소요 시간이 짧은 순</span>
        <span>③ 먼저 탈출한 순</span>
      </section>

      <section className="ranking-summary-grid">
        <article>
          <span>완료 인원</span>
          <strong>{entries.length}</strong>
        </article>
        <article>
          <span>평균 점수</span>
          <strong>{averageScore}</strong>
        </article>
        <article>
          <span>최고 점수</span>
          <strong>{entries[0]?.verifiedScore ?? 0}</strong>
        </article>
        <article>
          <span>최단 기록</span>
          <strong>
            {fastestSeconds === null ? "-" : formatDuration(fastestSeconds)}
          </strong>
        </article>
      </section>

      {entries.length > 0 && (
        <section className="ranking-podium" aria-label="상위 3명">
          {[entries[1], entries[0], entries[2]].map((entry, index) => {
            const displayRank = [2, 1, 3][index]
            return entry ? (
              <article className={`rank-${displayRank}`} key={entry.attemptId}>
                <i>{displayRank}</i>
                <strong>{entry.nickname}</strong>
                <span>{entry.verifiedScore}점</span>
                <small>{formatDuration(entry.elapsedSeconds)}</small>
              </article>
            ) : (
              <span key={`empty-${displayRank}`} />
            )
          })}
        </section>
      )}

      <section className="admin-question-section ranking-table-panel">
        <header>
          <div>
            <h3>{selectedCampaign?.title ?? "배포를 선택해 주세요"}</h3>
          </div>
          {award ? (
            <div className="prize-status-control">
              <span>
                수상자 <b>{award.nickname}</b>
              </span>
              {winnerChanged && award.status !== "delivered" && (
                <button type="button" onClick={selectWinner} disabled={saving}>
                  현재 1위 반영
                </button>
              )}
              <select
                value={award.status}
                disabled={saving}
                onChange={(event) =>
                  changePrizeStatus(event.target.value as PrizeStatus)
                }
              >
                <option value="selected">1위 선정</option>
                <option value="notified">수상자 안내</option>
                <option value="delivered">지급 완료</option>
              </select>
            </div>
          ) : (
            <button
              className="admin-primary admin-action-with-icon"
              type="button"
              onClick={selectWinner}
              disabled={!entries.length || saving}
            >
              <AdminIcon name="award" />
              1위 수상자 확정
            </button>
          )}
        </header>

        <div className="ranking-table">
          <div className="ranking-table-head" aria-hidden="true">
            <span>순위</span>
            <span>참여자</span>
            <span>검증 점수</span>
            <span>소요 시간</span>
            <span>탈출 완료</span>
          </div>
          {loading ? (
            <p className="admin-empty">순위를 계산하고 있습니다…</p>
          ) : entries.length === 0 ? (
            <p className="admin-empty">아직 탈출을 완료한 참여자가 없습니다.</p>
          ) : (
            entries.map((entry) => (
              <article
                className={entry.rank <= 3 ? "is-top" : ""}
                key={entry.attemptId}
              >
                <b>{entry.rank}</b>
                <span>
                  <strong>{entry.nickname}</strong>
                  <small>
                    {entry.department || "부서 미입력"} ·{" "}
                    {entry.institutionName}
                  </small>
                </span>
                <em>
                  {entry.verifiedScore} / {entry.answeredCount}
                </em>
                <time>{formatDuration(entry.elapsedSeconds)}</time>
                <time dateTime={entry.completedAt}>
                  {new Date(entry.completedAt).toLocaleString("ko-KR")}
                </time>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}
