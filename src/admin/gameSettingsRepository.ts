import { adminRequest } from "./serverApi"

export type GameDifficulty = "easy" | "normal" | "hard"

export interface GameSettings {
  title: string
  description: string
  coverImageUrl: string
  educationTopic: string
  difficulty: GameDifficulty
  estimatedMinutes: number
  defaultTimeLimitMinutes: number
  public: boolean
  updatedAt: string | null
  updatedByLoginId: string | null
}

export async function getGameSettings(): Promise<GameSettings> {
  return adminRequest<GameSettings>("/game-settings")
}

export async function updateGameSettings(
  input: Omit<GameSettings, "updatedAt" | "updatedByLoginId">,
): Promise<GameSettings> {
  return adminRequest<GameSettings>("/game-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}
