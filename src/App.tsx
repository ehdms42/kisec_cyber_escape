import { useState } from "react"
import DesignSystemScreen from "./screens/DesignSystemScreen"
import GameScreen from "./screens/GameScreen"
import NicknameScreen from "./screens/NicknameScreen"
import OnboardingScreen from "./screens/OnboardingScreen"
import ResultScreen from "./screens/ResultScreen"
import TitleScreen from "./screens/TitleScreen"

type Screen = "title" | "nickname" | "story" | "game" | "result"

const NICKNAME_STORAGE_KEY = "cyber-quest-nickname"

export default function App() {
  const showDesignSystem = new URLSearchParams(window.location.search).has(
    "design-system",
  )
  const [screen, setScreen] = useState<Screen>("title")
  const [nickname, setNickname] = useState(
    () => window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "",
  )
  const [score, setScore] = useState(0)
  const [gameKey, setGameKey] = useState(0)
  const [hasGameSession, setHasGameSession] = useState(false)

  const startGame = () => {
    setGameKey((value) => value + 1)
    setHasGameSession(true)
    setScreen("game")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const finishGame = (finalScore: number) => {
    setScore(finalScore)
    setScreen("result")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const confirmNickname = (name: string) => {
    setNickname(name)
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, name)
    setScreen("story")
  }

  const goHome = () => {
    setHasGameSession(false)
    setScreen("title")
  }

  const goBackFromGame = () => {
    setHasGameSession(false)
    setScreen("story")
  }

  const goBackFromResult = () => {
    setScreen("game")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const page = {
    title: <TitleScreen onStart={() => setScreen("nickname")} />,
    nickname: (
      <NicknameScreen initialName={nickname} onConfirm={confirmNickname} />
    ),
    story: <OnboardingScreen nickname={nickname} onComplete={startGame} />,
    game: null,
    result: (
      <ResultScreen score={score} onBack={goBackFromResult} onHome={goHome} />
    ),
  }[screen]

  if (showDesignSystem) {
    return (
      <div className="app-shell screen-design-system">
        <DesignSystemScreen />
      </div>
    )
  }

  return (
    <div className={`app-shell screen-${screen}`}>
      {hasGameSession && (
        <div className="game-session" hidden={screen !== "game"}>
          <GameScreen
            key={gameKey}
            onFinish={finishGame}
            onExit={goBackFromGame}
          />
        </div>
      )}
      {screen !== "game" && page}
      {(screen === "title" || screen === "result") && (
        <footer className="site-copyright">
          Copyright © KISEC. All rights reserved.
        </footer>
      )}
    </div>
  )
}
