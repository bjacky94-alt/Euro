/// <reference lib="webworker" />

import type { Draw, FilterProgress, WorkerRequest, WorkerResponse } from '../types'
import {
  TOTAL_COMBINATIONS,
  TOTAL_NUMBER_COMBINATIONS,
  TOTAL_STAR_COMBINATIONS,
} from '../types'
import { clearBit, createBitmap, countActiveBits, isBitSet } from '../utils/bitmap'
import { createTriplets, rankCombination } from '../utils/combinations'

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let stopRequested = false

const post = (message: WorkerResponse): void => {
  ctx.postMessage(message)
}

const toArrayBuffer = (bitmap: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bitmap)
  return copy.buffer
}

const hasConsecutiveRun = (numbers: readonly number[]): boolean => {
  let run = 1
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] === numbers[i - 1] + 1) {
      run += 1
      if (run >= 3) {
        return true
      }
    } else {
      run = 1
    }
  }
  return false
}

const hasSameUnitDigit = (numbers: readonly number[]): boolean => {
  const unit = numbers[0] % 10
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] % 10 !== unit) {
      return false
    }
  }
  return true
}

const reportProgress = (
  phase: FilterProgress['phase'],
  analyzed: number,
  total: number,
  removed: number,
  startedAt: number,
): void => {
  const elapsedMs = Date.now() - startedAt
  const rate = analyzed > 0 ? elapsedMs / analyzed : 0
  const etaMs = analyzed > 0 ? Math.max(0, (total - analyzed) * rate) : 0

  post({
    type: 'progress',
    payload: {
      phase,
      analyzed,
      total,
      removed,
      elapsedMs,
      etaMs,
    },
  })
}

const buildStats = (bitmap: Uint8Array) => {
  const active = countActiveBits(bitmap)
  const removed = TOTAL_COMBINATIONS - active
  return {
    total: TOTAL_COMBINATIONS,
    active,
    removed,
    percentageRemaining: (active / TOTAL_COMBINATIONS) * 100,
  }
}

const createVisitedBitmap = (bitsCount: number): Uint8Array =>
  new Uint8Array(Math.ceil(bitsCount / 8))

const markVisited = (visited: Uint8Array, bitIndex: number): boolean => {
  const byteIndex = bitIndex >> 3
  const bitOffset = bitIndex & 7
  const mask = 1 << bitOffset
  if ((visited[byteIndex] & mask) !== 0) {
    return false
  }
  visited[byteIndex] |= mask
  return true
}

const waitTick = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const nextCombination = (comb: number[], n: number, k: number): boolean => {
  let i = k - 1
  while (i >= 0 && comb[i] === n - k + i + 1) {
    i -= 1
  }
  if (i < 0) {
    return false
  }

  comb[i] += 1
  for (let j = i + 1; j < k; j += 1) {
    comb[j] = comb[j - 1] + 1
  }
  return true
}

const applyPermanentFilters = async (): Promise<void> => {
  stopRequested = false
  console.log('Worker started createBase')
  const bitmap = createBitmap()
  console.log('Bitmap initialized')

  const startedAt = Date.now()
  let removedFilter1 = 0
  let removedFilter3 = 0
  let analyzed = 0
  const chunkSize = 2500

  reportProgress('createBase', 0, TOTAL_COMBINATIONS, 0, startedAt)

  const numbers1 = [1, 2, 3, 4, 5]
  for (let numberIndex = 0; numberIndex < TOTAL_NUMBER_COMBINATIONS; numberIndex += 1) {
    if (stopRequested) {
      break
    }

    analyzed = (numberIndex + 1) * TOTAL_STAR_COMBINATIONS

    if (hasConsecutiveRun(numbers1)) {
      const base = numberIndex * TOTAL_STAR_COMBINATIONS
      for (let s = 0; s < TOTAL_STAR_COMBINATIONS; s += 1) {
        if (clearBit(bitmap, base + s)) {
          removedFilter1 += 1
        }
      }
    }

    if ((numberIndex + 1) % 1000 === 0) {
      reportProgress('createBase', analyzed, TOTAL_COMBINATIONS, removedFilter1, startedAt)
    }

    if ((numberIndex + 1) % chunkSize === 0) {
      await waitTick()
    }

    if (numberIndex < TOTAL_NUMBER_COMBINATIONS - 1) {
      nextCombination(numbers1, 50, 5)
    }
  }

  console.log('Filter 1 done')

  const numbers3 = [1, 2, 3, 4, 5]
  for (let numberIndex = 0; numberIndex < TOTAL_NUMBER_COMBINATIONS; numberIndex += 1) {
    if (stopRequested) {
      break
    }

    analyzed = (numberIndex + 1) * TOTAL_STAR_COMBINATIONS

    if (hasSameUnitDigit(numbers3)) {
      const base = numberIndex * TOTAL_STAR_COMBINATIONS
      for (let s = 0; s < TOTAL_STAR_COMBINATIONS; s += 1) {
        if (clearBit(bitmap, base + s)) {
          removedFilter3 += 1
        }
      }
    }

    if ((numberIndex + 1) % 1000 === 0) {
      reportProgress(
        'createBase',
        analyzed,
        TOTAL_COMBINATIONS,
        removedFilter1 + removedFilter3,
        startedAt,
      )
    }

    if ((numberIndex + 1) % chunkSize === 0) {
      await waitTick()
    }

    if (numberIndex < TOTAL_NUMBER_COMBINATIONS - 1) {
      nextCombination(numbers3, 50, 5)
    }
  }

  console.log('Filter 3 done')

  reportProgress(
    'createBase',
    TOTAL_COMBINATIONS,
    TOTAL_COMBINATIONS,
    removedFilter1 + removedFilter3,
    startedAt,
  )

  const stats = buildStats(bitmap)
  post({
    type: 'done',
    phase: 'createBase',
    bitmap: toArrayBuffer(bitmap),
    stats,
    removed: removedFilter1 + removedFilter3,
    cancelled: stopRequested,
  })
  console.log('Worker done sent')
}

const applyFilter2 = async (bitmapBuffer: ArrayBuffer, history: Draw[]): Promise<void> => {
  stopRequested = false
  const bitmap = new Uint8Array(bitmapBuffer)

  const startedAt = Date.now()
  const activeAtStart = countActiveBits(bitmap)
  const totalForProgress = Math.max(1, activeAtStart)
  let removed = 0
  let analyzed = 0
  const visited = createVisitedBitmap(TOTAL_COMBINATIONS)

  if (history.length === 0) {
    post({
      type: 'done',
      phase: 'filter2',
      bitmap: toArrayBuffer(bitmap),
      stats: buildStats(bitmap),
      removed,
      cancelled: false,
    })
    console.log('Worker done sent')
    return
  }

  const starIndexesByDraw = history.map((draw) => {
    const [a, b] = draw.stars
    const indexes: number[] = []
    for (let s1 = 1; s1 <= 11; s1 += 1) {
      for (let s2 = s1 + 1; s2 <= 12; s2 += 1) {
        if (s1 === a || s2 === a || s1 === b || s2 === b) {
          indexes.push(rankCombination([s1, s2], 12, 2))
        }
      }
    }
    return indexes
  })

  const yieldChunk = 20000

  for (let drawIndex = 0; drawIndex < history.length; drawIndex += 1) {
    if (stopRequested) {
      break
    }

    const draw = history[drawIndex]
    const triplets = createTriplets(draw.numbers)
    const starIndexes = starIndexesByDraw[drawIndex]

    for (const triplet of triplets) {
      const excluded = new Set(triplet)
      const others: number[] = []
      for (let value = 1; value <= 50; value += 1) {
        if (!excluded.has(value)) {
          others.push(value)
        }
      }

      for (let i = 0; i < others.length - 1; i += 1) {
        for (let j = i + 1; j < others.length; j += 1) {
          const numbers = [...triplet, others[i], others[j]].sort((x, y) => x - y)
          const numberIndex = rankCombination(numbers, 50, 5)
          const base = numberIndex * TOTAL_STAR_COMBINATIONS

          for (const starIndex of starIndexes) {
            const bitIndex = base + starIndex
            if (markVisited(visited, bitIndex) && isBitSet(bitmap, bitIndex)) {
              analyzed += 1
            }

            if (clearBit(bitmap, bitIndex)) {
              removed += 1
            }
          }

          if (analyzed % yieldChunk === 0) {
            reportProgress('filter2', analyzed, totalForProgress, removed, startedAt)
            await waitTick()
          }

          if (stopRequested) {
            break
          }
        }
        if (stopRequested) {
          break
        }
      }
      if (stopRequested) {
        break
      }
    }
  }

  reportProgress('filter2', analyzed, totalForProgress, removed, startedAt)

  post({
    type: 'done',
    phase: 'filter2',
    bitmap: toArrayBuffer(bitmap),
    stats: buildStats(bitmap),
    removed,
    cancelled: stopRequested,
  })
  console.log('Worker done sent')
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data

  try {
    if (data.type === 'stop') {
      stopRequested = true
      return
    }

    if (data.type === 'createBase') {
      void applyPermanentFilters().catch((error) => {
        const message = error instanceof Error ? error.message : 'Erreur worker inconnue'
        post({ type: 'error', message })
      })
      return
    }

    if (data.type === 'applyFilter2') {
      void applyFilter2(data.bitmap, data.history).catch((error) => {
        const message = error instanceof Error ? error.message : 'Erreur worker inconnue'
        post({ type: 'error', message })
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur worker inconnue'
    post({ type: 'error', message })
  }
}
