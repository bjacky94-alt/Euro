import { TOTAL_NUMBER_COMBINATIONS, TOTAL_STAR_COMBINATIONS } from '../types'
import { isBitSet } from './bitmap'
import { chooseN } from './combinations'

export interface DecodedCombination {
  index: number
  numbers: [number, number, number, number, number]
  stars: [number, number]
}

interface UsageCounters {
  numbers: number[]
  stars: number[]
}

const GROUP_SIZE = 10

const STAR_PAIRS: [number, number][] = []
for (let a = 1; a <= 11; a += 1) {
  for (let b = a + 1; b <= 12; b += 1) {
    STAR_PAIRS.push([a, b])
  }
}

const unrankCombination = (rankInput: number, n: number, k: number): number[] => {
  let rank = rankInput
  const result: number[] = []
  let previous = 0

  for (let i = 0; i < k; i += 1) {
    for (let value = previous + 1; value <= n; value += 1) {
      const count = chooseN(n - value, k - i - 1)
      if (rank < count) {
        result.push(value)
        previous = value
        break
      }
      rank -= count
    }
  }

  return result
}

export const decodeCombinationIndex = (index: number): DecodedCombination => {
  const numberRank = Math.floor(index / TOTAL_STAR_COMBINATIONS)
  const starRank = index % TOTAL_STAR_COMBINATIONS
  const numbers = unrankCombination(numberRank, 50, 5) as [
    number,
    number,
    number,
    number,
    number,
  ]
  const stars = STAR_PAIRS[starRank]

  return {
    index,
    numbers,
    stars,
  }
}

export const isCombinationActive = (bitmap: Uint8Array, index: number): boolean =>
  isBitSet(bitmap, index)

const createUsageCountersForGroup = (
  results: number[],
  groupStart: number,
  groupEndExclusive: number,
): UsageCounters => {
  const counters: UsageCounters = {
    numbers: Array(51).fill(0),
    stars: Array(13).fill(0),
  }

  for (let i = groupStart; i < groupEndExclusive && i < results.length; i += 1) {
    const index = results[i]
    if (index < 0) {
      continue
    }

    const decoded = decodeCombinationIndex(index)
    for (const n of decoded.numbers) {
      counters.numbers[n] += 1
    }
    for (const s of decoded.stars) {
      counters.stars[s] += 1
    }
  }

  return counters
}

export const scoreCandidate = (candidate: DecodedCombination, usageCounters: UsageCounters): number => {
  let score = 0
  for (const n of candidate.numbers) {
    const usedCount = usageCounters.numbers[n]
    if (usedCount > 0) {
      // Penalize strongly repeated main numbers inside the current group of 10.
      score += 100 + usedCount * 20
    }
  }
  for (const s of candidate.stars) {
    const usedCount = usageCounters.stars[s]
    if (usedCount > 0) {
      // Stars are secondary, so the penalty is lighter than main numbers.
      score += 10 + usedCount * 2
    }
  }
  return score
}

const findBestCandidate = (
  bitmap: Uint8Array,
  used: Set<number>,
  existingResults: number[],
  targetPosition: number,
): number | null => {
  let best: { index: number; score: number } | null = null
  const maxIndex = TOTAL_NUMBER_COMBINATIONS * TOTAL_STAR_COMBINATIONS
  const groupStart = Math.floor(targetPosition / GROUP_SIZE) * GROUP_SIZE
  const groupEndExclusive = groupStart + GROUP_SIZE
  const groupUsage = createUsageCountersForGroup(existingResults, groupStart, groupEndExclusive)

  for (let i = 0; i < 256; i += 1) {
    const candidateIndex = Math.floor(Math.random() * maxIndex)
    if (used.has(candidateIndex) || !isCombinationActive(bitmap, candidateIndex)) {
      continue
    }

    const decoded = decodeCombinationIndex(candidateIndex)
    const score = scoreCandidate(decoded, groupUsage)
    if (!best || score < best.score) {
      best = { index: candidateIndex, score }
    }
  }

  if (best) {
    return best.index
  }

  const start = Math.floor(Math.random() * maxIndex)
  for (let i = 0; i < maxIndex; i += 1) {
    const candidateIndex = (start + i) % maxIndex
    if (!used.has(candidateIndex) && isCombinationActive(bitmap, candidateIndex)) {
      return candidateIndex
    }
  }

  return null
}

export const generateMoreResults = (
  bitmap: Uint8Array,
  existingResults: number[],
  targetCount: number,
): number[] => {
  const nextResults = [...existingResults]
  const used = new Set(existingResults)

  while (nextResults.length < targetCount) {
    const candidate = findBestCandidate(bitmap, used, nextResults, nextResults.length)
    if (candidate === null) {
      break
    }
    nextResults.push(candidate)
    used.add(candidate)
  }

  return nextResults
}

export const replaceInactiveResults = (
  bitmap: Uint8Array,
  generatedResults: number[],
): number[] => {
  if (generatedResults.every((index) => isCombinationActive(bitmap, index))) {
    return generatedResults
  }

  const nextResults = [...generatedResults]
  const inactivePositions: number[] = []
  const activeForUsage: number[] = []

  for (let i = 0; i < nextResults.length; i += 1) {
    if (isCombinationActive(bitmap, nextResults[i])) {
      activeForUsage.push(nextResults[i])
    } else {
      inactivePositions.push(i)
      nextResults[i] = -1
    }
  }

  const used = new Set(activeForUsage)

  for (const position of inactivePositions) {
    const replacement = findBestCandidate(bitmap, used, nextResults, position)
    if (replacement === null) {
      // Keep order stable if no replacement can be found right now.
      nextResults[position] = generatedResults[position]
      continue
    }
    nextResults[position] = replacement
    used.add(replacement)
  }

  return nextResults
}
