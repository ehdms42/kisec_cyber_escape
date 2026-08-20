export interface QuestionParts {
  context: string
  prompt: string
  details: string[]
}

export function splitQuestion(text: string): QuestionParts {
  const blocks = text.trim().split(/\n\s*\n/)
  const opening = blocks[0]
  const instructionAt = opening.lastIndexOf("다음 중")

  return {
    context: instructionAt > 0 ? opening.slice(0, instructionAt).trim() : "",
    prompt: instructionAt > 0 ? opening.slice(instructionAt).trim() : opening,
    details: blocks
      .slice(1)
      .join("\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  }
}
