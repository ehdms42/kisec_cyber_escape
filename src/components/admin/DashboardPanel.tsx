import { useCallback, useEffect, useState } from "react"
import { getDashboardSummary } from "../../admin/dashboardRepository"
import type {
  DashboardQuestionAccuracy,
  DashboardSummary,
} from "../../admin/dashboardRepository"
import AdminIcon, { type AdminIconName } from "./AdminIcon"

function formatMinutesSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}분 ${seconds}초`
}

interface StatCardProps {
  icon: AdminIconName
  accent: "blue" | "green" | "amber" | "purple"
  label: string
  value: string | number
}

function StatCard({ icon, accent, label, value }: StatCardProps) {
  return (
    <article className={`dashboard-stat-card accent-${accent}`}>
      <span className="dashboard-stat-icon">
        <AdminIcon name={icon} />
      </span>
      <span className="dashboard-stat-body">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
    </article>
  )
}

function AccuracyRow({ item }: { item: DashboardQuestionAccuracy }) {
  return (
    <div className="dashboard-accuracy-row">
      <b>{item.ordinal}</b>
      <span className="dashboard-accuracy-category">{item.category}</span>
      <span className="dashboard-accuracy-bar">
        <span style={{ width: `${Math.min(100, item.accuracyRate)}%` }} />
      </span>
      <span className="dashboard-accuracy-value">{item.accuracyRate}%</span>
      <span className="dashboard-accuracy-count">{item.attempts}명 응답</span>
    </div>
  )
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
    <main className="admin-content dashboard-page">
      <section className="admin-page-heading">
        <div>
          <h2>대시보드</h2>
          <p>게임 운영에 필요한 핵심 현황을 한 화면에서 확인합니다.</p>
        </div>
        <div>
          <button type="button" onClick={() => void refresh()}>
            <AdminIcon name="sync" />
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
            <p className="dashboard-degraded-note">
              로컬 데이터 모드에서는 참가자·응시 관련 일부 통계가 표시되지
              않습니다. (Supabase 연결 필요)
            </p>
          )}

          <div className="dashboard-stat-row" aria-label="세션 현황">
            <StatCard
              icon="monitor"
              accent="blue"
              label="진행 중인 세션"
              value={summary.sessionsInProgress}
            />
            <StatCard
              icon="calendar"
              accent="purple"
              label="오늘 예정 세션"
              value={summary.sessionsToday}
            />
            <StatCard
              icon="participants"
              accent="blue"
              label="전체 참가자"
              value={summary.totalParticipants}
            />
          </div>

          <div className="dashboard-stat-row" aria-label="운영 지표">
            <StatCard
              icon="percent"
              accent="green"
              label="완료율"
              value={`${summary.completionRate}%`}
            />
            <StatCard
              icon="timer"
              accent="amber"
              label="평균 탈출 시간"
              value={formatMinutesSeconds(summary.averageElapsedSeconds)}
            />
            <StatCard
              icon="lightbulb"
              accent="amber"
              label="힌트 사용 횟수"
              value={summary.hintUsageTotal}
            />
          </div>

          <div className="dashboard-panel-grid">
            <section className="dashboard-card">
              <header>
                <AdminIcon name="trophy" />
                <div>
                  <h3>현재 1위</h3>
                  <small>진행 중인 세션 기준</small>
                </div>
              </header>
              {summary.currentLeaders.length === 0 ? (
                <p className="dashboard-empty-row">
                  진행 중인 세션이 없습니다.
                </p>
              ) : (
                <div className="dashboard-card-rows">
                  {summary.currentLeaders.map((leader) => (
                    <div className="dashboard-card-row" key={leader.campaignId}>
                      <span className="dashboard-card-row-main">
                        <strong>{leader.nickname}</strong>
                        <small>
                          {leader.institutionName} · {leader.campaignTitle}
                        </small>
                      </span>
                      <b>{leader.verifiedScore}점</b>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-card">
              <header>
                <AdminIcon name="flag" />
                <div>
                  <h3>최근 종료된 세션</h3>
                  <small>최신순 5건</small>
                </div>
              </header>
              {summary.recentCompletedSessions.length === 0 ? (
                <p className="dashboard-empty-row">
                  최근 종료된 세션이 없습니다.
                </p>
              ) : (
                <div className="dashboard-card-rows">
                  {summary.recentCompletedSessions.map((session) => (
                    <div
                      className="dashboard-card-row"
                      key={session.campaignId}
                    >
                      <span className="dashboard-card-row-main">
                        <strong>{session.campaignTitle}</strong>
                        <small>{session.institutionName}</small>
                      </span>
                      <time dateTime={session.endedAt}>
                        {new Date(session.endedAt).toLocaleDateString("ko-KR")}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="dashboard-card">
            <header>
              <AdminIcon name="alert" />
              <div>
                <h3>진행 지연 참가자</h3>
                <small>15분 이상 응답이 없는 진행 중 참가자</small>
              </div>
            </header>
            {summary.stalledAttempts.length === 0 ? (
              <p className="dashboard-empty-row">지연된 참가자가 없습니다.</p>
            ) : (
              <div className="dashboard-card-rows">
                {summary.stalledAttempts.map((attempt) => (
                  <div className="dashboard-card-row" key={attempt.attemptId}>
                    <span className="dashboard-card-row-main">
                      <strong>{attempt.nickname}</strong>
                    </span>
                    <time dateTime={attempt.lastSeenAt}>
                      {new Date(attempt.lastSeenAt).toLocaleTimeString("ko-KR")}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-card">
            <header>
              <AdminIcon name="questions" />
              <div>
                <h3>문항별 정답률</h3>
                <small>공개된 문제 전체</small>
              </div>
            </header>
            {summary.questionAccuracy.length === 0 ? (
              <p className="dashboard-empty-row">집계된 응답이 없습니다.</p>
            ) : (
              <div className="dashboard-accuracy-list">
                {summary.questionAccuracy.map((item) => (
                  <AccuracyRow item={item} key={item.ordinal} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
