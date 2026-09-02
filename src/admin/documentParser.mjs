const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"]
const KOREAN_OPTIONS = ["가", "나", "다", "라", "마", "바", "사", "아"]

export function cleanDocumentText(text) {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isTableDivider(value) {
  return /^:?-{2,}:?$/.test(value.replace(/\s/g, ""))
}

function tableCells(line) {
  if (!line.includes("|")) return []
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell && !isTableDivider(cell))
}

function expandedLines(text) {
  return cleanDocumentText(text)
    .split("\n")
    .flatMap((original) => {
      const line = original.trim()
      if (!line) return []
      const cells = tableCells(line)
      return cells.length ? cells : [line]
    })
}

function parseAnswerToken(value) {
  const normalized = String(value).trim().toUpperCase()
  const circledIndex = CIRCLED_NUMBERS.findIndex((number) =>
    normalized.includes(number),
  )
  if (circledIndex >= 0) return circledIndex

  const koreanIndex = KOREAN_OPTIONS.findIndex((letter) =>
    new RegExp(`(?:^|[^가-힣])${letter}(?:[^가-힣]|$)`).test(normalized),
  )
  if (koreanIndex >= 0) return koreanIndex

  const letter = normalized.match(/(?:^|[^A-Z])([A-H])(?:[^A-Z]|$)/)
  if (letter) return letter[1].charCodeAt(0) - 65

  const number = normalized.match(/(?:^|\D)([1-8])(?:\D|$)/)
  return number ? Number(number[1]) - 1 : null
}

function questionStart(line) {
  const explicit = line.match(
    /^(?:문제|문항|문)\s*(\d{1,3})\s*(?:[.)]|번)?\s*(.*)$/,
  )
  if (explicit) {
    return { number: Number(explicit[1]), rest: explicit[2].trim() }
  }

  const numbered = line.match(/^(\d{1,3})\s*(?:[.)]|번)\s*(.*)$/)
  if (numbered) {
    return { number: Number(numbered[1]), rest: numbered[2].trim() }
  }

  const tableNumber = line.match(/^(\d{1,3})$/)
  return tableNumber ? { number: Number(tableNumber[1]), rest: "" } : null
}

function splitQuestionBlocks(lines) {
  const blocks = []
  let current = null

  for (const line of lines) {
    if (current) {
      const inlineOptions = inlineCircledOptions(line)
      if (inlineOptions.length) {
        current.lines.push(line)
        current.optionCount = Math.max(
          current.optionCount,
          ...inlineOptions.map((option) => option.index + 1),
        )
        continue
      }
      const option = parseOption(line)
      if (option && option.index === current.optionCount) {
        current.lines.push(line)
        current.optionCount += 1
        continue
      }
    }

    const start = questionStart(line)
    if (start) {
      if (current) blocks.push(current)
      current = {
        number: start.number,
        lines: start.rest ? [start.rest] : [],
        optionCount: 0,
      }
      continue
    }
    if (current) current.lines.push(line)
  }

  if (current) blocks.push(current)
  return blocks
}

function inlineCircledOptions(line) {
  const matches = [...line.matchAll(/[①②③④⑤⑥⑦⑧]/g)]
  if (matches.length < 2) return []
  return matches.map((match, index) => {
    const optionIndex = CIRCLED_NUMBERS.indexOf(match[0])
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? line.length
    return { index: optionIndex, text: line.slice(start, end).trim() }
  })
}

function parseOption(line) {
  const normalized = line.replace(/^\*+|\*+$/g, "").trim()
  const circled = CIRCLED_NUMBERS.findIndex((number) =>
    normalized.startsWith(number),
  )
  if (circled >= 0) {
    return {
      index: circled,
      text: normalized.slice(CIRCLED_NUMBERS[circled].length).trim(),
    }
  }

  const numeric = normalized.match(/^\(?([1-8])\)?[.)]\s*(.+)$/)
  if (numeric) return { index: Number(numeric[1]) - 1, text: numeric[2].trim() }

  const korean = normalized.match(/^([가나다라마바사아])[.)]\s*(.+)$/)
  if (korean) {
    return {
      index: KOREAN_OPTIONS.indexOf(korean[1]),
      text: korean[2].trim(),
    }
  }

  const letter = normalized.match(/^([A-Ha-h])[.)]\s*(.+)$/)
  return letter
    ? {
        index: letter[1].toUpperCase().charCodeAt(0) - 65,
        text: letter[2].trim(),
      }
    : null
}

function parseQuestionBlock(block) {
  const promptLines = []
  const options = []
  let category = "미분류"
  let sourceReference = ""

  for (const originalLine of block.lines) {
    const line = originalLine.replace(/^\|?|\|?$/g, "").trim()
    if (!line || isTableDivider(line)) continue

    const categoryMatch = line.match(/^(?:분류|영역|카테고리)\s*[:：]\s*(.+)$/)
    if (categoryMatch) {
      category = categoryMatch[1].trim()
      continue
    }

    const sourceMatch = line.match(/^(?:출처|참고)\s*[:：]\s*(.+)$/)
    if (sourceMatch) {
      sourceReference = sourceMatch[1].trim()
      continue
    }

    const inlineOptions = inlineCircledOptions(line)
    if (inlineOptions.length) {
      for (const option of inlineOptions) options[option.index] = option.text
      continue
    }

    const option = parseOption(line)
    if (option) {
      options[option.index] = option.text
      continue
    }

    promptLines.push(line)
  }

  const compactOptions = options.filter(Boolean)
  const warnings = []
  if (!promptLines.length) warnings.push("문제 본문을 확인해 주세요.")
  if (compactOptions.length < 2) warnings.push("보기가 두 개 미만입니다.")

  return {
    sourceNumber: block.number,
    category,
    prompt: promptLines.join("\n").trim(),
    options: compactOptions,
    correctAnswer: -1,
    explanation: "",
    sourceReference,
    warnings,
  }
}

export function parseQuestionSheet(text) {
  return splitQuestionBlocks(expandedLines(text)).map(parseQuestionBlock)
}

function answerMatches(line) {
  const matches = []
  const pattern =
    /(?:문제|문항|문)?\s*(\d{1,3})(?:\s*번|\s*[.)]|\s*\|\s*|\s+)\s*(?:정답\s*[:：]?\s*)?([①②③④⑤⑥⑦⑧A-Ha-h가나다라마바사아1-8])/g
  for (const match of line.matchAll(pattern)) {
    const answer = parseAnswerToken(match[2])
    if (answer !== null) {
      matches.push({
        number: Number(match[1]),
        answer,
        end: (match.index ?? 0) + match[0].length,
      })
    }
  }
  return matches
}

function appendExplanation(entry, value) {
  const cleaned = value
    .replace(/^(?:해설|설명|풀이)\s*[:：-]?\s*/, "")
    .replace(/^\|+|\|+$/g, "")
    .trim()
  if (!cleaned || /^(?:정답|답안)$/.test(cleaned)) return
  entry.explanation = [entry.explanation, cleaned].filter(Boolean).join("\n")
}

function applyAnswer(entry, answer) {
  if (entry.correctAnswer >= 0 && entry.correctAnswer !== answer) {
    entry.conflicted = true
    return
  }
  entry.correctAnswer = answer
}

export function parseAnswerSheet(text) {
  const answers = new Map()
  let currentNumber = null

  for (const originalLine of cleanDocumentText(text).split("\n")) {
    const line = originalLine.trim()
    if (!line || isTableDivider(line)) continue

    const cells = tableCells(line)
    if (
      cells.length >= 2 &&
      /^(?:문제|문항|문)?\s*\d{1,3}(?:번)?$/.test(cells[0])
    ) {
      const number = Number(cells[0].match(/\d{1,3}/)?.[0])
      const answerCellIndex = cells.findIndex(
        (cell, index) => index > 0 && parseAnswerToken(cell) !== null,
      )
      if (number && answerCellIndex > 0) {
        const entry = answers.get(number) ?? {
          correctAnswer: -1,
          explanation: "",
        }
        applyAnswer(entry, parseAnswerToken(cells[answerCellIndex]))
        cells
          .slice(answerCellIndex + 1)
          .forEach((cell) => appendExplanation(entry, cell))
        answers.set(number, entry)
        currentNumber = number
        continue
      }
    }

    const matches = answerMatches(line)
    if (matches.length > 1) {
      for (const match of matches) {
        const entry = answers.get(match.number) ?? {
          correctAnswer: -1,
          explanation: "",
        }
        applyAnswer(entry, match.answer)
        answers.set(match.number, entry)
      }
      currentNumber = null
      continue
    }

    if (matches.length === 1) {
      const match = matches[0]
      const entry = answers.get(match.number) ?? {
        correctAnswer: -1,
        explanation: "",
      }
      applyAnswer(entry, match.answer)
      appendExplanation(entry, line.slice(match.end))
      answers.set(match.number, entry)
      currentNumber = match.number
      continue
    }

    if (currentNumber !== null) {
      const entry = answers.get(currentNumber)
      if (entry) appendExplanation(entry, line)
    }
  }

  return answers
}

export function mergeQuestionAndAnswerTexts(questionText, answerText) {
  const answers = parseAnswerSheet(answerText)
  const questions = parseQuestionSheet(questionText)
  const questionNumberCounts = questions.reduce((counts, question) => {
    counts.set(
      question.sourceNumber,
      (counts.get(question.sourceNumber) ?? 0) + 1,
    )
    return counts
  }, new Map())

  return questions.map((question) => {
    const answer = answers.get(question.sourceNumber)
    const warnings = [...question.warnings]
    let correctAnswer = answer?.correctAnswer ?? -1

    if ((questionNumberCounts.get(question.sourceNumber) ?? 0) > 1) {
      correctAnswer = -1
      warnings.push("문제지에 같은 문제 번호가 중복되어 있습니다.")
    }
    if (answer?.conflicted) {
      correctAnswer = -1
      warnings.push("해답지에 서로 다른 정답이 중복되어 있습니다.")
    }
    if (correctAnswer < 0 || correctAnswer >= question.options.length) {
      correctAnswer = -1
      if (!warnings.some((warning) => warning.includes("중복"))) {
        warnings.push("해답지의 정답 번호를 확인해 주세요.")
      }
    }
    if (!answer?.explanation) {
      warnings.push("해답지에서 해설을 찾지 못했습니다.")
    }

    return {
      ...question,
      correctAnswer,
      explanation: answer?.explanation ?? "",
      warnings,
    }
  })
}

export function parseQuestionsFromText(text) {
  const normalized = cleanDocumentText(text)
  const lines = normalized.split("\n")
  const answerSection = lines.findIndex((line) =>
    /^(?:정답|답안)(?:\s*표|\s*및\s*해설)?\s*[:：]?$/.test(line.trim()),
  )
  if (answerSection < 0) return parseQuestionSheet(normalized)
  return mergeQuestionAndAnswerTexts(
    lines.slice(0, answerSection).join("\n"),
    lines.slice(answerSection + 1).join("\n"),
  )
}
