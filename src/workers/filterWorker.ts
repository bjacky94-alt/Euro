/// <reference lib="webworker" />

import type { Draw, FilterProgress, WorkerRequest, WorkerResponse } from '../types'
import {
  TOTAL_COMBINATIONS,
  TOTAL_NUMBER_COMBINATIONS,
  TOTAL_STAR_COMBINATIONS,
} from '../types'
import { clearBit, createBitmap, countActiveBits } from '../utils/bitmap'

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

// Precompute for each draw: the set of 5 numbers and the star pair indexes
// compatible with at least 1 draw star (max 21 star indexes out of 66).
const buildDrawStarIndexes = (stars: Draw['stars']): number[] => {
  const [a, b] = stars
  const indexes: number[] = []
  let si = 0
  for (let s1 = 1; s1 <= 11; s1 += 1) {
    for (let s2 = s1 + 1; s2 <= 12; s2 += 1) {
      if (s1 === a || s2 === a || s1 === b || s2 === b) {
        indexes.push(si)
      }
      si += 1
    }
  }
  return indexes
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
  let removed = 0
  let lastProgressAt = startedAt

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

  // Precompute per draw: number set + compatible star pair indexes.
  const drawData = history.map((draw) => ({
    numbersSet: new Set<number>(draw.numbers),
    starIndexes: buildDrawStarIndexes(draw.stars),
  }))

  // Reusable buffer to collect star indexes to suppress for a given number combo.
  const toSuppressBuffer = new Uint8Array(TOTAL_STAR_COMBINATIONS)

  // Iterate directly over all C(50,5) number combinations using the
  // nextCombination approach — avoids any rankCombination overhead.
  const CHUNK = 2000
  const numbers = [1, 2, 3, 4, 5]

  for (let ni = 0; ni < TOTAL_NUMBER_COMBINATIONS; ni += 1) {
    if (stopRequested) {
      break
    }

    // Check each draw: does this number combo have >= 3 matches?
    let suppressCount = 0
    for (const { numbersSet, starIndexes } of drawData) {
      let matches = 0
      for (let i = 0; i < 5; i += 1) {
        if (numbersSet.has(numbers[i])) {
          matches += 1
        }
      }
      if (matches >= 3) {
        for (const si of starIndexes) {
          if (toSuppressBuffer[si] === 0) {
            toSuppressBuffer[si] = 1
            suppressCount += 1
          }
        }
      }
    }

    if (suppressCount > 0) {
      const base = ni * TOTAL_STAR_COMBINATIONS
      for (let si = 0; si < TOTAL_STAR_COMBINATIONS; si += 1) {
        if (toSuppressBuffer[si] === 1) {
          toSuppressBuffer[si] = 0 // reset for next iteration
          if (clearBit(bitmap, base + si)) {
            removed += 1
          }
        }
      }
    }

    // Advance to next combination.
    if (ni < TOTAL_NUMBER_COMBINATIONS - 1) {
      nextCombination(numbers, 50, 5)
    }

    // Yield regularly so the worker never blocks and progress stays live.
    if ((ni + 1) % CHUNK === 0 || Date.now() - lastProgressAt >= 150) {
      const now = Date.now()
      lastProgressAt = now
      reportProgress('filter2', ni + 1, TOTAL_NUMBER_COMBINATIONS, removed, startedAt)
      await waitTick()
    }
  }

  reportProgress('filter2', TOTAL_NUMBER_COMBINATIONS, TOTAL_NUMBER_COMBINATIONS, removed, startedAt)

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
