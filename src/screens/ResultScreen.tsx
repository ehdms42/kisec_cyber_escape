import { QUIZ_LENGTH } from "../game/config"
import {
  SECURITY_LEVEL_META,
  securityLevelFromResult,
  type SecurityLevel,
} from "../game/securityLevel"

interface ResultScreenProps {
  score: number
  securityLevel?: SecurityLevel | null
  onBack: () => void
  onHome: () => void
}

function getResultGrade(rate: number) {
  if (rate >= 90) {
    return { stars: 3, message: "빈틈없는 보안 실력이에요." }
  }
  if (rate >= 70) {
    return { stars: 2, message: "안정적으로 보안 임무를 완수했어요." }
  }
  if (rate >= 40) {
    return { stars: 1, message: "보안 임무를 끝까지 완수했어요." }
  }
  return {
    stars: 0,
    message: "임무를 완수했어요. 놓친 문항을 다시 확인해 보세요.",
  }
}

export default function ResultScreen({
  score,
  securityLevel,
  onBack,
  onHome,
}: ResultScreenProps) {
  const safeScore = Math.min(Math.max(score, 0), QUIZ_LENGTH)
  const rate = Math.round((safeScore / QUIZ_LENGTH) * 100)
  const grade = getResultGrade(rate)
  const resultSecurityLevel =
    securityLevel ?? securityLevelFromResult(safeScore, QUIZ_LENGTH)
  const securityLevelMeta = SECURITY_LEVEL_META[resultSecurityLevel]
  const rewardXp = safeScore * 100

  return (
    <div className="app-frame reward-screen escaped server-result">
      <div className="reward-room server-success" aria-hidden="true" />
      <div className="reward-shade" aria-hidden="true" />

      <header className="reward-topbar">
        <button onClick={onBack} aria-label="이전 화면으로 돌아가기">
          ←
        </button>
      </header>

      <main
        className="reward-board"
        aria-label={`정답 ${safeScore}개, 별 ${grade.stars}개, 정보보안 등급 ${securityLevelMeta.label}`}
      >
        <header className="result-heading">
          <h1>탈출 성공</h1>
        </header>

        <div
          className="rank-stars rank-stars-art"
          aria-label={`등급 별 ${grade.stars}개`}
        >
          {[0, 1, 2].map((index) => (
            <img
              key={index}
              className={index < grade.stars ? "earned" : ""}
              src="/result-rank-star.svg"
              alt=""
              aria-hidden="true"
            />
          ))}
        </div>

        <p className="result-message">{grade.message}</p>

        <section className="reward-card">
          <div className={`result-security-grade level-${resultSecurityLevel}`}>
            <span>정보보안 등급</span>
            <strong>{securityLevelMeta.label}</strong>
            <small>{securityLevelMeta.shortDescription}</small>
          </div>

          <div className="reward-scoreline">
            <span>
              <small>정답</small>
              <strong>
                {safeScore}
                <i>/{QUIZ_LENGTH}</i>
              </strong>
            </span>
            <span>
              <small>획득 경험치</small>
              <strong>
                +{rewardXp}
                <i> 경험치</i>
              </strong>
            </span>
          </div>

          <div className="result-progress-copy">
            <span>보안 문항 정답률</span>
            <strong>{rate}%</strong>
          </div>

          <div className="xp-track" aria-label={`정답률 ${rate}%`}>
            <span style={{ width: `${rate}%` }} />
          </div>
        </section>

        <button className="reward-primary" onClick={onHome}>
          기록 완료
        </button>
      </main>
    </div>
  )
}
