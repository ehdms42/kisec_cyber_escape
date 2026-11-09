interface PickableQuestion {
  id: string
  category: string
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

// 분류마다 무작위로 섞은 뒤 분류를 돌아가며 한 문항씩 뽑는다.
// 문항이 적은 분류가 바닥나면 나머지 분류에서 계속 채우므로
// 분류별 개수가 최대한 고르고, 출제 순서에서도 분류가 섞인다.
export function pickBalancedQuestions<T extends PickableQuestion>(
  questions: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const pools = new Map<string, T[]>()
  for (const question of questions) {
    const pool = pools.get(question.category) ?? []
    pool.push(question)
    pools.set(question.category, pool)
  }
  const queues = shuffled([...pools.values()], random).map((pool) =>
    shuffled(pool, random),
  )
  const picked: T[] = []
  while (picked.length < count && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (picked.length >= count) break
      const next = queue.shift()
      if (next) picked.push(next)
    }
  }
  return picked
}

export function countByCategory(questions: readonly PickableQuestion[]) {
  const counts = new Map<string, number>()
  for (const question of questions) {
    counts.set(question.category, (counts.get(question.category) ?? 0) + 1)
  }
  return [...counts.entries()]
}
