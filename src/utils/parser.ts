import type { Draw } from '../types'

export interface ParseResult {
  draws: Draw[]
  ignoredLines: number[]
}

const normalizeTokens = (line: string): number[] => {
  const compact = line
    .replace(/\+/g, ' ')
    .replace(/[;,\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!compact) {
    return []
  }

  return compact
    .split(' ')
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isFinite(value))
}

const isUnique = (values: number[]): boolean => new Set(values).size === values.length

export const parseHistoryInput = (raw: string): ParseResult => {
  const lines = raw.split(/\r?\n/)
  const draws: Draw[] = []
  const ignoredLines: number[] = []

  lines.forEach((line, lineIndex) => {
    const values = normalizeTokens(line)
    if (values.length === 0) {
      return
    }
    if (values.length < 7) {
      ignoredLines.push(lineIndex + 1)
      return
    }

    const numbers = values.slice(0, 5).sort((a, b) => a - b)
    const stars = values.slice(5, 7).sort((a, b) => a - b)

    const validNumbers =
      numbers.length === 5 &&
      numbers.every((n) => n >= 1 && n <= 50) &&
      isUnique(numbers)
    const validStars =
      stars.length === 2 && stars.every((s) => s >= 1 && s <= 12) && isUnique(stars)

    if (!validNumbers || !validStars) {
      ignoredLines.push(lineIndex + 1)
      return
    }

    draws.push({
      numbers: numbers as Draw['numbers'],
      stars: stars as Draw['stars'],
    })
  })

  return { draws, ignoredLines }
}
