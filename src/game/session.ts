import type { GamePhase, PuzzleId } from "./config"

export interface GameProgress {
  phase: GamePhase
  completed: PuzzleId[]
  activeId: PuzzleId | null
  questionStep: number
  selectedAnswer: number | null
  score: number
  answeredCount: number
  levelScoreStart: number
  levelAnsweredStart: number
  selectedHotspot: PuzzleId | "door" | null
  codeInput: number[]
  focusedId: PuzzleId | null
}

export const EMPTY_GAME_PROGRESS: GameProgress = {
  phase: "room",
  completed: [],
  activeId: null,
  questionStep: 0,
  selectedAnswer: null,
  score: 0,
  answeredCount: 0,
  levelScoreStart: 0,
  levelAnsweredStart: 0,
  selectedHotspot: null,
  codeInput: [],
  focusedId: null,
}

const PHASES: GamePhase[] = ["room", "quiz", "reveal", "keypad"]
const PUZZLE_IDS: PuzzleId[] = ["console", "patch", "backup", "ups"]

function validPuzzle(value: unknown): value is PuzzleId {
  return typeof value === "string" && PUZZLE_IDS.includes(value as PuzzleId)
}

function integer(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback
}

export function normalizeGameProgress(
  value: Record<string, unknown> | null | undefined,
): GameProgress {
  if (!value) return EMPTY_GAME_PROGRESS
  const phase = PHASES.includes(value.phase as GamePhase)
    ? value.phase as GamePhase
    : "room"
  const completed = Array.isArray(value.completed)
    ? [...new Set(value.completed.filter(validPuzzle))]
    : []
  const activeId = validPuzzle(value.activeId) ? value.activeId : null
  const selectedHotspot =
    value.selectedHotspot === "door" || validPuzzle(value.selectedHotspot)
      ? value.selectedHotspot
      : null
  const focusedId = validPuzzle(value.focusedId) ? value.focusedId : null

  return {
    phase,
    completed,
    activeId,
    questionStep: integer(value.questionStep),
    selectedAnswer:
      value.selectedAnswer === null
        ? null
        : typeof value.selectedAnswer === "number"
          ? integer(value.selectedAnswer)
          : null,
    score: integer(value.score),
    answeredCount: integer(value.answeredCount),
    levelScoreStart: integer(value.levelScoreStart),
    levelAnsweredStart: integer(value.levelAnsweredStart),
    selectedHotspot,
    codeInput: Array.isArray(value.codeInput)
      ? value.codeInput.filter(
          (digit): digit is number =>
            typeof digit === "number" &&
            Number.isInteger(digit) &&
            digit >= 0 &&
            digit <= 9,
        )
      : [],
    focusedId,
  }
}
