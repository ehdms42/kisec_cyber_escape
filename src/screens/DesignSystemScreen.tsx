const colors = [
  ["네이비", "system-swatch-navy", "#051832"],
  ["딥 블루", "system-swatch-deep-blue", "#12439C"],
  ["액션 블루", "system-swatch-action", "#2F6FEC"],
  ["라이트 블루", "system-swatch-light", "#BFD4F7"],
  ["보상 골드", "system-swatch-gold", "#F5B92F"],
  ["오류 레드", "system-swatch-red", "#D84655"],
]

export default function DesignSystemScreen() {
  return (
    <div className="app-frame design-system-screen">
      <header className="design-system-header">
        <div>
          <small>KISEC GAME UI</small>
          <h1>디자인 시스템</h1>
          <p>한 화면에서 색상, 글꼴, 버튼과 상태 표현을 확인합니다.</p>
        </div>
        <a href="/">게임 보기</a>
      </header>

      <main className="design-system-content">
        <section className="design-system-section">
          <h2>색상</h2>
          <div className="system-swatches">
            {colors.map(([name, className, value]) => (
              <div className="system-swatch" key={name}>
                <i className={className} />
                <strong>{name}</strong>
                <small>{value}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="design-system-section">
          <h2>타이포그래피</h2>
          <div className="system-type-sample">
            <strong>탈출 성공</strong>
            <p>보안 임무를 무사히 완료했어요.</p>
            <b>30/30 · +3000 경험치</b>
          </div>
        </section>

        <section className="design-system-section">
          <h2>패널과 버튼</h2>
          <div className="system-panel-light">
            <small>탐색 지점 발견</small>
            <strong>관리자 콘솔</strong>
            <p>장치를 조사하고 보안 문제를 해결하세요.</p>
            <button type="button">조사 시작</button>
          </div>
          <div className="system-button-row">
            <button className="system-button-primary" type="button">
              기본 행동
            </button>
            <button className="system-button-secondary" type="button">
              보조 행동
            </button>
          </div>
        </section>

        <section className="design-system-section">
          <h2>정답과 오답</h2>
          <div className="system-state-list">
            <div className="system-state correct">
              <b>✓</b>
              <span>
                <strong>정답</strong>
                <small>선택한 답이 맞습니다.</small>
              </span>
            </div>
            <div className="system-state wrong">
              <b>×</b>
              <span>
                <strong>오답</strong>
                <small>다시 확인해 보세요.</small>
              </span>
            </div>
          </div>
        </section>

        <section className="design-system-section system-reward-preview">
          <h2>보상</h2>
          <img src="/result-rank-star.svg" alt="획득 별" />
          <strong>임무 완료</strong>
          <small>별과 골드는 보상 정보에만 사용합니다.</small>
        </section>
      </main>
    </div>
  )
}
