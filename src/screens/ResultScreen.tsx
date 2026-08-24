import type { CSSProperties } from "react"
import { DOOR_CODE, QUIZ_LENGTH } from "../game/config"

interface ResultScreenProps {
  score: number
  nickname: string
  onRestart: () => void
  onBack: () => void
  onHome: () => void
}

export default function ResultScreen({
  score,
  nickname,
  onRestart,
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
        <span>MISSION RESULT</span>
        <b>01</b>
      </header>

      <main
        className="reward-board"
        aria-label={`정답 ${score}개, 별 ${score}개 획득`}
      >
        <div className="reward-ribbon success">
          <small>VAULT UNLOCKED</small>
          <strong>탈출 성공!</strong>
        </div>

        <div className="rank-stars" aria-label={`등급 별 ${rankStars}개`}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={index < rankStars ? "earned" : ""}>
              ★
            </span>
          ))}
        </div>

        <p className="result-player">
          <span>AGENT</span>
          {nickname}
        </p>

        <section className="reward-card">
          <div className="final-door-code">
            <small>ESCAPE CODE COMPLETE</small>
            <div>
              {DOOR_CODE.map((digit) => (
                <b key={digit} className="revealed">
                  {digit}
                </b>
              ))}
            </div>
          </div>
          <div className="reward-scoreline">
            <span>
              <small>SECURITY SCORE</small>
              <strong>
                {score}
                <i>/{QUIZ_LENGTH}</i>
              </strong>
            </span>
            <span>
              <small>REWARD</small>
              <strong>
                +{rewardXp}
                <i> XP</i>
              </strong>
            </span>
          </div>

          <div className="clue-stars" aria-label={`단서 별 ${score}개 획득`}>
            {Array.from({ length: QUIZ_LENGTH }, (_, index) => (
              <span
                key={index}
                className={index < score ? "earned" : ""}
                style={
                  { "--star-delay": `${0.55 + index * 0.08}s` } as CSSProperties
                }
              >
                ★
              </span>
            ))}
          </div>
          <p>
            단서 별 <strong>{score}개</strong> 획득
          </p>

          <div className="xp-track" aria-label={`경험치 ${rate}%`}>
            <span style={{ width: `${rate}%` }} />
          </div>
          <small className="escape-rule">보안 문항 정답률 {rate}%</small>
        </section>

        <button className="reward-primary" onClick={onHome}>
          기록 완료
          <span>▶</span>
        </button>
        <button className="reward-secondary" onClick={onRestart}>
          다시 플레이
        </button>
      </main>
    </div>
  )
}
