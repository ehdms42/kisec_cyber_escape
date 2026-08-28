import { QUIZ_LENGTH } from "../game/config"

interface ResultScreenProps {
  score: number
  onBack: () => void
  onHome: () => void
}

export default function ResultScreen({
  score,
  onBack,
  onHome,
}: ResultScreenProps) {
  const rate = Math.round((score / QUIZ_LENGTH) * 100)
  const rankStars = score >= 27 ? 3 : score >= 21 ? 2 : score >= 12 ? 1 : 0
  const rewardXp = score * 100

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
        aria-label={`정답 ${score}개, 등급 별 ${rankStars}개 획득`}
      >
        <header className="result-heading">
          <h1>탈출 성공</h1>
        </header>

        <div
          className="rank-stars rank-stars-art"
          aria-label={`등급 별 ${rankStars}개`}
        >
          {[0, 1, 2].map((index) => (
            <img
              key={index}
              className={index < rankStars ? "earned" : ""}
              src="/result-rank-star.svg"
              alt=""
              aria-hidden="true"
            />
          ))}
        </div>

        <p className="result-message">보안 임무를 무사히 완료했어요.</p>

        <section className="reward-card">
          <div className="reward-scoreline">
            <span>
              <small>정답</small>
              <strong>
                {score}
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
