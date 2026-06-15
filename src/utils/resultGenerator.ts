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

const createUsageCounters = (results: number[]): UsageCounters => {
  const counters: UsageCounters = {
    numbers: Array(51).fill(0),
    stars: Array(13).fill(0),
  }

  for (const index of results) {
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

const registerInUsage = (usage: UsageCounters, candidateIndex: number): void => {
  const decoded = decodeCombinationIndex(candidateIndex)
  for (const n of decoded.numbers) {
    usage.numbers[n] += 1
  }
  for (const s of decoded.stars) {
    usage.stars[s] += 1
  }
}

export const scoreCandidate = (candidate: DecodedCombination, usageCounters: UsageCounters): number => {
  let score = 0
  for (const n of candidate.numbers) {
    score += usageCounters.numbers[n]
  }
  for (const s of candidate.stars) {
    score += usageCounters.stars[s]
  }
  return score
}

const findBestCandidate = (
  bitmap: Uint8Array,
  used: Set<number>,
  usage: UsageCounters,
): number | null => {
  let best: { index: number; score: number } | null = null
  const maxIndex = TOTAL_NUMBER_COMBINATIONS * TOTAL_STAR_COMBINATIONS

  for (let i = 0; i < 96; i += 1) {
    const candidateIndex = Math.floor(Math.random() * maxIndex)
    if (used.has(candidateIndex) || !isCombinationActive(bitmap, candidateIndex)) {
      continue
    }

    const decoded = decodeCombinationIndex(candidateIndex)
    const score = scoreCandidate(decoded, usage)
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
  const usage = createUsageCounters(existingResults)

  while (nextResults.length < targetCount) {
    const candidate = findBestCandidate(bitmap, used, usage)
    if (candidate === null) {
      break
    }
    nextResults.push(candidate)
    used.add(candidate)
    registerInUsage(usage, candidate)
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
  const usage = createUsageCounters(activeForUsage)

  for (const position of inactivePositions) {
    const replacement = findBestCandidate(bitmap, used, usage)
    if (replacement === null) {
      break
    }
    nextResults[position] = replacement
    used.add(replacement)
    registerInUsage(usage, replacement)
  }

  return nextResults.filter((index) => index >= 0)
}
