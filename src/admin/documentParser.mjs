const CIRCLED_NUMBER_SETS = [
  ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"],
  ["❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽"],
]
const CIRCLED_NUMBERS = CIRCLED_NUMBER_SETS.flat()
const PARENTHESIZED_KOREAN = ["㉠", "㉡", "㉢", "㉣", "㉤", "㉥", "㉦", "㉧"]
const KOREAN_OPTIONS = ["가", "나", "다", "라", "마", "바", "사", "아"]

function symbolOptionIndex(symbol) {
  for (const numberSet of CIRCLED_NUMBER_SETS) {
    const index = numberSet.indexOf(symbol)
    if (index >= 0) return index
  }
  return PARENTHESIZED_KOREAN.indexOf(symbol)
}

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
      if (!line) return [""]
      const cells = tableCells(line)
      return cells.length ? cells : [line]
    })
}

function parseAnswerToken(value) {
  const normalized = String(value).trim().toUpperCase()
  const optionSymbol = CIRCLED_NUMBERS.concat(PARENTHESIZED_KOREAN).find(
    (symbol) => normalized.includes(symbol),
  )
  if (optionSymbol) return symbolOptionIndex(optionSymbol)

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
    /^(?:문제|문항|문|제)\s*(\d{1,3})\s*(?:[.)]|번|문)?\s*(.*)$/,
  )
  if (explicit) {
    return { number: Number(explicit[1]), rest: explicit[2].trim() }
  }

  const decorated = line.match(
    /^(?:Q(?:UESTION)?\s*[.:#-]?\s*)?[([【]\s*(\d{1,3})\s*[)\]】]\s*[.)]?\s*(.*)$/i,
  )
  if (decorated) {
    return { number: Number(decorated[1]), rest: decorated[2].trim() }
  }

  const qNumber = line.match(
    /^Q(?:UESTION)?\s*[.:#-]?\s*(\d{1,3})\s*(?:[.)]|번)?\s*(.*)$/i,
  )
  if (qNumber) {
    return { number: Number(qNumber[1]), rest: qNumber[2].trim() }
  }

  const numbered = line.match(/^(\d{1,3})\s*(?:[.)]|번|[:：])\s*(.*)$/)
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
    if (!line) continue

    const option = current ? parseOption(line) : null
    const continuesOptionGroup =
      option &&
      option.kind === current?.optionKind &&
      option.index === current?.optionCount
    const startsOptionGroup =
      option &&
      option.index === 0 &&
      option.kind !== current?.optionKind &&
      (current?.optionKind === null ||
        option.kind !== "numeric" ||
        /^(?:\(|\[|【)\s*1\s*(?:\)|\]|】)/.test(line))
    const isUnambiguousNumberedOption =
      option?.kind !== "numeric" ||
      /^(?:(?:\(|\[|【)\s*\d+\s*(?:\)|\]|】)|\d+\s*\))/.test(line)

    if (current && current.optionCount >= 2) {
      const sequentialStart = questionStart(line)
      if (
        sequentialStart?.number === current.number + 1 &&
        (!(continuesOptionGroup || startsOptionGroup) ||
          !isUnambiguousNumberedOption)
      ) {
        blocks.push(current)
        current = {
          number: sequentialStart.number,
          lines: sequentialStart.rest ? [sequentialStart.rest] : [],
          optionCount: 0,
          optionKind: null,
        }
        continue
      }
    }

    if (current) {
      const inlineOptions = inlineSymbolOptions(line)
      if (inlineOptions.length) {
        current.lines.push(line)
        current.optionKind = "symbol"
        current.optionCount = Math.max(
          current.optionCount,
          ...inlineOptions.map((option) => option.index + 1),
        )
        continue
      }
      if (continuesOptionGroup || startsOptionGroup) {
        current.lines.push(line)
        current.optionKind = option.kind
        current.optionCount = option.index + 1
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
        optionKind: null,
      }
      continue
    }
    if (current) {
      current.lines.push(line)
    }
  }

  if (current) blocks.push(current)
  return blocks
}

function inlineSymbolOptions(line) {
  const matches = [...line.matchAll(/[①②③④⑤⑥⑦⑧❶❷❸❹❺❻❼❽㉠㉡㉢㉣㉤㉥㉦㉧]/g)]
  if (matches.length < 2) return []
  return matches.map((match, index) => {
    const optionIndex = symbolOptionIndex(match[0])
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? line.length
    return {
      index: optionIndex,
      text: line.slice(start, end).trim(),
      kind: "symbol",
    }
  })
}

function parseOption(line) {
  const normalized = line.replace(/^\*+|\*+$/g, "").trim()
  const optionSymbol = CIRCLED_NUMBERS.concat(PARENTHESIZED_KOREAN).find(
    (symbol) => normalized.startsWith(symbol),
  )
  if (optionSymbol) {
    return {
      index: symbolOptionIndex(optionSymbol),
      text: normalized.slice(optionSymbol.length).trim(),
      kind: "symbol",
    }
  }

  const numeric = normalized.match(
    /^(?:\[|【|\()?([1-8])(?:\]|】|\))?\s*(?:[.)]|번)?\s+(.+)$/,
  )
  if (numeric) {
    return {
      index: Number(numeric[1]) - 1,
      text: numeric[2].trim(),
      kind: "numeric",
    }
  }

  const korean = normalized.match(
    /^(?:\()?([가나다라마바사아])(?:\))?\s*[.)]?\s+(.+)$/,
  )
  if (korean && !/^[\s.,·]+$/.test(korean[2])) {
    return {
      index: KOREAN_OPTIONS.indexOf(korean[1]),
      text: korean[2].trim(),
      kind: "korean",
    }
  }

  const letter = normalized.match(/^\(?([A-Ha-h])\)?\s*[.)]?\s+(.+)$/)
  return letter
    ? {
        index: letter[1].toUpperCase().charCodeAt(0) - 65,
        text: letter[2].trim(),
        kind: "letter",
      }
    : null
}

function parseQuestionBlock(block) {
  const promptLines = []
  const optionGroups = []
  let currentOptionGroup = null
  let currentOptionIndex = null
  let category = "미분류"
  let sourceReference = ""

  const beginOptionGroup = (kind) => {
    currentOptionGroup = { kind, options: [] }
    optionGroups.push(currentOptionGroup)
  }

  const addOptions = (candidates) => {
    for (const option of candidates) {
      if (
        !currentOptionGroup ||
        currentOptionGroup.kind !== option.kind ||
        (option.index === 0 && currentOptionGroup.options[0])
      ) {
        beginOptionGroup(option.kind)
      }
      currentOptionGroup.options[option.index] = option.text
      currentOptionIndex = option.index
    }
  }

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

    const inlineOptions = inlineSymbolOptions(line)
    if (inlineOptions.length) {
      addOptions(inlineOptions)
      continue
    }

    const option = parseOption(line)
    if (option) {
      addOptions([option])
      continue
    }

    if (currentOptionGroup && currentOptionIndex !== null) {
      currentOptionGroup.options[currentOptionIndex] = [
        currentOptionGroup.options[currentOptionIndex],
        line,
      ]
        .filter(Boolean)
        .join(" ")
    } else {
      promptLines.push(line)
    }
  }

  const selectableGroup = [...optionGroups]
    .reverse()
    .find((group) => group.options.filter(Boolean).length >= 2)
  const compactOptions = selectableGroup?.options.filter(Boolean) ?? []
  const supportingLines = optionGroups
    .filter((group) => group !== selectableGroup)
    .flatMap((group) =>
      group.options.flatMap((option, index) => {
        if (!option) return []
        const label =
          group.kind === "korean"
            ? `${KOREAN_OPTIONS[index]}.`
            : group.kind === "letter"
              ? `${String.fromCharCode(65 + index)}.`
              : group.kind === "symbol"
                ? (CIRCLED_NUMBER_SETS[0][index] ?? `${index + 1}.`)
                : `(${index + 1})`
        return [`${label} ${option}`]
      }),
    )
  const warnings = []
  const prompt = [...promptLines, ...supportingLines].join("\n").trim()
  if (!prompt) warnings.push("문제 본문을 확인해 주세요.")
  if (compactOptions.length < 2) warnings.push("보기가 두 개 미만입니다.")

  const confidence = Math.max(
    0,
    Math.min(
      0.72,
      (prompt ? 0.32 : 0) +
        (compactOptions.length >= 2 ? 0.3 : compactOptions.length * 0.08) +
        (block.number ? 0.1 : 0),
    ),
  )

  return {
    sourceNumber: block.number,
    category,
    prompt,
    options: compactOptions,
    correctAnswer: -1,
    explanation: "",
    sourceReference,
    warnings,
    confidence,
    matchMethod: "unmatched",
  }
}

export function parseQuestionSheet(text) {
  return splitQuestionBlocks(expandedLines(text)).map(parseQuestionBlock)
}

function answerMatches(line) {
  const matches = []
  const pattern =
    /(?:문제|문항|문|제)?\s*(\d{1,3})(?:\s*번|\s*[.)]|\s*\|\s*|\s*[:：=\-]\s*|\s+)\s*(?:[:：=\-]\s*)?(?:정답\s*[:：=\-]?\s*)?([①②③④⑤⑥⑦⑧❶❷❸❹❺❻❼❽㉠㉡㉢㉣㉤㉥㉦㉧A-Ha-h가나다라마바사아1-8])/g
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
  const labeled = /^(?:해설|설명|풀이)\s*[:：-]?/.test(value.trim())
  const cleaned = value
    .replace(/^(?:해설|설명|풀이)\s*[:：-]?\s*/, "")
    .replace(/^\|+|\|+$/g, "")
    .trim()
  if (labeled || cleaned) entry.explanationProvided = true
  if (
    !cleaned ||
    /^(?:정답|답안)$/.test(cleaned) ||
    /^(?:-|없음|해당\s*없음)$/i.test(cleaned)
  ) {
    return
  }
  entry.explanation = [entry.explanation, cleaned].filter(Boolean).join("\n")
}

function appendSourceReference(entry, value) {
  const cleaned = value
    .replace(/^(?:참고|출처|근거)\s*[:：-]?\s*/, "")
    .replace(/^\|+|\|+$/g, "")
    .trim()
  if (!cleaned || /^(?:-|없음|해당\s*없음)$/i.test(cleaned)) return
  entry.sourceReference = [entry.sourceReference, cleaned]
    .filter(Boolean)
    .join("\n")
}

function createAnswerEntry() {
  return {
    correctAnswer: -1,
    explanation: "",
    explanationProvided: false,
    category: "",
    sourceReference: "",
  }
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
  let currentField = null
  const lines = cleanDocumentText(text).split("\n")
  const consumedTableLines = new Set()

  for (let index = 0; index < lines.length; index += 1) {
    const headerCells = tableCells(lines[index])
    if (
      headerCells.length < 3 ||
      !/^(?:문항|문제(?:\s*번호)?|번호)$/i.test(headerCells[0])
    ) {
      continue
    }
    const numbers = headerCells.slice(1).map((cell) => {
      const match = cell.match(/\d{1,3}/)
      return match ? Number(match[0]) : null
    })
    if (numbers.filter(Boolean).length < 2) continue

    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      if (!lines[candidate].trim() || isTableDivider(lines[candidate])) continue
      const answerCells = tableCells(lines[candidate])
      if (!answerCells.length || !/^(?:정답|답)$/i.test(answerCells[0])) break
      numbers.forEach((number, answerIndex) => {
        const answer = parseAnswerToken(answerCells[answerIndex + 1])
        if (!number || answer === null) return
        const entry = answers.get(number) ?? createAnswerEntry()
        applyAnswer(entry, answer)
        answers.set(number, entry)
      })
      consumedTableLines.add(index)
      consumedTableLines.add(candidate)

      const explanationCells = tableCells(lines[candidate + 1] ?? "")
      if (/^(?:해설|설명|풀이)$/i.test(explanationCells[0] ?? "")) {
        numbers.forEach((number, answerIndex) => {
          const entry = number ? answers.get(number) : null
          if (entry) appendExplanation(entry, explanationCells[answerIndex + 1])
        })
        consumedTableLines.add(candidate + 1)
      }
      break
    }
  }

  for (const [lineIndex, originalLine] of lines.entries()) {
    if (consumedTableLines.has(lineIndex)) continue
    const line = originalLine.trim()
    if (!line || isTableDivider(line)) continue

    const sectionHeader = line.match(
      /^(?:문제|문항)?\s*(\d{1,3})\s*(?:번|[.)])\s*(?:\(([^)]+)\)|\[([^\]]+)\])?\s*$/,
    )
    if (sectionHeader) {
      currentNumber = Number(sectionHeader[1])
      const entry = answers.get(currentNumber) ?? createAnswerEntry()
      entry.category =
        sectionHeader[2]?.trim() ?? sectionHeader[3]?.trim() ?? entry.category
      answers.set(currentNumber, entry)
      currentField = null
      continue
    }

    if (currentNumber !== null) {
      const entry = answers.get(currentNumber) ?? createAnswerEntry()
      const directAnswer = line.match(
        /^(?:정답|답안?|모범답안)\s*[:：=\-]?\s*(.+)$/,
      )
      if (directAnswer) {
        const answer = parseAnswerToken(directAnswer[1])
        if (answer !== null) applyAnswer(entry, answer)
        answers.set(currentNumber, entry)
        currentField = "answer"
        continue
      }

      const explanation = line.match(/^(?:해설|설명|풀이)\s*[:：-]?\s*(.*)$/)
      if (explanation) {
        appendExplanation(entry, explanation[1])
        answers.set(currentNumber, entry)
        currentField = "explanation"
        continue
      }

      const source = line.match(/^(?:참고|출처|근거)\s*[:：-]?\s*(.*)$/)
      if (source) {
        appendSourceReference(entry, source[1])
        answers.set(currentNumber, entry)
        currentField = "source"
        continue
      }
    }

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
        const entry = answers.get(number) ?? createAnswerEntry()
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
        const entry = answers.get(match.number) ?? createAnswerEntry()
        applyAnswer(entry, match.answer)
        answers.set(match.number, entry)
      }
      currentNumber = null
      currentField = null
      continue
    }

    if (matches.length === 1) {
      const match = matches[0]
      const entry = answers.get(match.number) ?? createAnswerEntry()
      applyAnswer(entry, match.answer)
      appendExplanation(entry, line.slice(match.end))
      answers.set(match.number, entry)
      currentNumber = match.number
      currentField = "explanation"
      continue
    }

    if (currentNumber !== null) {
      const entry = answers.get(currentNumber)
      if (entry && currentField === "explanation") {
        appendExplanation(entry, line)
      } else if (entry && currentField === "source") {
        appendSourceReference(entry, line)
      }
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

  const usedAnswerNumbers = new Set()
  const merged = questions.map((question) => {
    const answer = answers.get(question.sourceNumber)
    if (answer) usedAnswerNumbers.add(question.sourceNumber)
    const warnings = [...question.warnings]
    let correctAnswer = answer?.correctAnswer ?? -1
    let matchMethod = answer ? "number" : "unmatched"

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
    if (!answer?.explanation && !answer?.explanationProvided) {
      warnings.push("해답지에서 해설을 찾지 못했습니다.")
    }

    const confidence =
      correctAnswer >= 0
        ? Math.min(0.98, question.confidence + (answer ? 0.24 : 0))
        : Math.min(question.confidence, 0.45)

    return {
      ...question,
      category:
        question.category === "미분류" && answer?.category
          ? answer.category
          : question.category,
      correctAnswer,
      explanation: answer?.explanation ?? "",
      sourceReference:
        question.sourceReference || answer?.sourceReference || "",
      warnings,
      confidence,
      matchMethod,
    }
  })

  const unmatchedQuestions = merged.filter(
    (question) => question.matchMethod === "unmatched",
  )
  const unmatchedAnswers = [...answers.entries()].filter(
    ([number]) => !usedAnswerNumbers.has(number),
  )

  if (
    unmatchedQuestions.length >= 2 &&
    unmatchedQuestions.length === unmatchedAnswers.length
  ) {
    unmatchedQuestions.forEach((question, index) => {
      const [, answer] = unmatchedAnswers[index]
      if (
        answer.conflicted ||
        answer.correctAnswer < 0 ||
        answer.correctAnswer >= question.options.length
      ) {
        return
      }
      question.correctAnswer = answer.correctAnswer
      question.explanation = answer.explanation
      if (question.category === "미분류" && answer.category) {
        question.category = answer.category
      }
      if (!question.sourceReference && answer.sourceReference) {
        question.sourceReference = answer.sourceReference
      }
      question.matchMethod = "order"
      question.confidence = Math.min(question.confidence, 0.58)
      question.warnings = question.warnings.filter(
        (warning) =>
          !warning.includes("정답 번호") && !warning.includes("해설을 찾지"),
      )
      question.warnings.push(
        "문제 번호가 일치하지 않아 문서에 나온 순서로 연결했습니다. 정답을 확인해 주세요.",
      )
      if (!answer.explanation && !answer.explanationProvided) {
        question.warnings.push("해답지에서 해설을 찾지 못했습니다.")
      }
    })
  }

  return merged
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
