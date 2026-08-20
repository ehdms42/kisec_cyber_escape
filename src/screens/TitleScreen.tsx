interface TitleScreenProps {
  onStart: () => void
}

export default function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <div className="app-frame title-screen">
      <div className="title-room" aria-hidden="true" />
      <div className="title-shade" aria-hidden="true" />
      <main className="title-content">
        <img src="/cyber-quest-lock-logo.png" alt="Cyber Quest" />
        <button onClick={onStart}>
          START <span>▶</span>
        </button>
        <small>사이버보안 실태평가 퀘스트</small>
      </main>
    </div>
  )
}
