import { useCallback, useEffect, useState } from "react"
import { getDashboardSummary } from "../../admin/dashboardRepository"
import type { DashboardSummary } from "../../admin/dashboardRepository"

function formatMinutesSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}분 ${seconds}초`
}

export default function DashboardPanel() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSummary(await getDashboardSummary())
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "대시보드 정보를 불러오지 못했습니다.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void refresh(), [refresh])

  return (
    <main className="admin-content">
      <section className="admin-page-heading">
        <div>
          <h2>대시보드</h2>
          <p>게임 운영에 필요한 핵심 현황을 한 화면에서 확인합니다.</p>
        </div>
        <div>
          <button type="button" onClick={() => void refresh()}>
            새로고침
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

      {loading || !summary ? (
        <p className="admin-empty">불러오는 중…</p>
      ) : (
        <>
          {summary.degraded && (
            <p className="ranking-rule-note">
              로컬 데이터 모드에서는 참가자·응시 관련 일부 통계가 표시되지
              않습니다. (Supabase 연결 필요)
            </p>
          )}

          <section className="admin-stat-grid" aria-label="세션 현황">
            <article>
              <span>진행 중인 세션</span>
              <strong>{summary.sessionsInProgress}</strong>
            </article>
            <article>
              <span>오늘 예정 세션</span>
              <strong>{summary.sessionsToday}</strong>
            </article>
            <article>
              <span>전체 참가자</span>
              <strong>{summary.totalParticipants}</strong>
            </article>
          </section>

          <section className="admin-stat-grid" aria-label="운영 지표">
            <article>
              <span>완료율</span>
              <strong>{summary.completionRate}%</strong>
            </article>
            <article>
              <span>평균 탈출 시간</span>
              <strong>
                {formatMinutesSeconds(summary.averageElapsedSeconds)}
              </strong>
            </article>
            <article>
              <span>힌트 사용 횟수</span>
              <strong>{summary.hintUsageTotal}</strong>
            </article>
          </section>

          <div className="institution-admin-grid">
            <section className="admin-question-section institution-list-panel">
              <header>
                <div>
                  <h3>현재 1위</h3>
                </div>
              </header>
              {summary.currentLeaders.length === 0 ? (
                <p className="admin-empty">진행 중인 세션이 없습니다.</p>
              ) : (
                summary.currentLeaders.map((leader) => (
                  <article key={leader.campaignId}>
                    <span>
                      <strong>{leader.nickname}</strong>
                      <small>
                        {leader.institutionName} · {leader.campaignTitle}
                      </small>
                    </span>
                    <i className="active">{leader.verifiedScore}점</i>
                  </article>
                ))
              )}
            </section>

            <section className="admin-question-section institution-list-panel">
              <header>
                <div>
                  <h3>최근 종료된 세션</h3>
                </div>
              </header>
              {summary.recentCompletedSessions.length === 0 ? (
                <p className="admin-empty">최근 종료된 세션이 없습니다.</p>
              ) : (
                summary.recentCompletedSessions.map((session) => (
                  <article key={session.campaignId}>
                    <span>
                      <strong>{session.campaignTitle}</strong>
                      <small>{session.institutionName}</small>
                    </span>
                    <i className="inactive">
                      {new Date(session.endedAt).toLocaleDateString("ko-KR")}
                    </i>
                  </article>
                ))
              )}
            </section>
          </div>

          <section className="admin-question-section institution-list-panel">
            <header>
              <div>
                <h3>진행 지연 참가자</h3>
                <small>15분 이상 응답이 없는 진행 중 참가자</small>
              </div>
            </header>
            {summary.stalledAttempts.length === 0 ? (
              <p className="admin-empty">지연된 참가자가 없습니다.</p>
            ) : (
              summary.stalledAttempts.map((attempt) => (
                <article key={attempt.attemptId}>
                  <span>
                    <strong>{attempt.nickname}</strong>
                  </span>
                  <i className="inactive">
                    {new Date(attempt.lastSeenAt).toLocaleTimeString("ko-KR")}
                  </i>
                </article>
              ))
            )}
          </section>

          <section className="admin-question-section">
            <header>
              <div>
                <h3>문항별 정답률</h3>
              </div>
            </header>
            <div className="admin-question-table">
              <div className="admin-table-head" aria-hidden="true">
                <span>번호</span>
                <span>분류</span>
                <span>응답 수</span>
                <span>정답률</span>
              </div>
              {summary.questionAccuracy.length === 0 ? (
                <p className="admin-empty">집계된 응답이 없습니다.</p>
              ) : (
                summary.questionAccuracy.map((item) => (
                  <article key={item.ordinal}>
                    <b>{item.ordinal}</b>
                    <span>{item.category}</span>
                    <span>{item.attempts}</span>
                    <i
                      className={
                        item.accuracyRate >= 60 ? "published" : "draft"
                      }
                    >
                      {item.accuracyRate}%
                    </i>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
