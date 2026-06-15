/// <reference lib="webworker" />

import type { Draw, FilterProgress, WorkerRequest, WorkerResponse } from '../types'
import {
  TOTAL_COMBINATIONS,
  TOTAL_STAR_COMBINATIONS,
} from '../types'
import { clearBit, createBitmap, countActiveBits, isBitSet } from '../utils/bitmap'
import { countMatchingNumbers, forEachCombination } from '../utils/combinations'

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

const applyPermanentFilters = (): void => {
  stopRequested = false
  const bitmap = createBitmap()
  const startedAt = Date.now()
  let removed = 0
  let analyzed = 0

  forEachCombination(50, 5, (numbers, numberIndex) => {
    if (stopRequested) {
      return
    }

    analyzed = (numberIndex + 1) * TOTAL_STAR_COMBINATIONS

    if (hasConsecutiveRun(numbers) || hasSameUnitDigit(numbers)) {
      const base = numberIndex * TOTAL_STAR_COMBINATIONS
      for (let s = 0; s < TOTAL_STAR_COMBINATIONS; s += 1) {
        if (clearBit(bitmap, base + s)) {
          removed += 1
        }
      }
    }

    if ((numberIndex + 1) % 4000 === 0) {
      reportProgress('createBase', analyzed, TOTAL_COMBINATIONS, removed, startedAt)
    }
  })

  const active = countActiveBits(bitmap)
  post({
    type: 'done',
    payload: {
      phase: 'createBase',
      bitmap: toArrayBuffer(bitmap),
      removed,
      active,
      cancelled: stopRequested,
    },
  })
}

const applyFilter2 = (bitmapBuffer: ArrayBuffer, history: Draw[]): void => {
  stopRequested = false
  const bitmap = new Uint8Array(bitmapBuffer)

  const startedAt = Date.now()
  let removed = 0
  let analyzed = 0

  if (history.length === 0) {
    post({
      type: 'done',
      payload: {
        phase: 'filter2',
        bitmap: toArrayBuffer(bitmap),
        removed,
        active: countActiveBits(bitmap),
        cancelled: false,
      },
    })
    return
  }

  const prepared = history.map((draw) => ({
    numbersSet: new Set<number>(draw.numbers),
    starsSet: new Set<number>(draw.stars),
  }))

  const starPairs: [number, number][] = []
  forEachCombination(12, 2, (pair) => {
    starPairs.push([pair[0], pair[1]])
  })

  forEachCombination(50, 5, (numbers, numberIndex) => {
    if (stopRequested) {
      return
    }

    const matchingDrawIndexes: number[] = []
    for (let i = 0; i < prepared.length; i += 1) {
      const matchedNumbers = countMatchingNumbers(numbers, prepared[i].numbersSet)
      if (matchedNumbers >= 3) {
        matchingDrawIndexes.push(i)
      }
    }

    const base = numberIndex * TOTAL_STAR_COMBINATIONS
    if (matchingDrawIndexes.length > 0) {
      for (let starIndex = 0; starIndex < starPairs.length; starIndex += 1) {
        const bitIndex = base + starIndex
        analyzed += 1

        if (!isBitSet(bitmap, bitIndex)) {
          continue
        }

        const [s1, s2] = starPairs[starIndex]
        let shouldRemove = false
        for (const drawIndex of matchingDrawIndexes) {
          const starsSet = prepared[drawIndex].starsSet
          if (starsSet.has(s1) || starsSet.has(s2)) {
            shouldRemove = true
            break
          }
        }

        if (shouldRemove && clearBit(bitmap, bitIndex)) {
          removed += 1
        }
      }
    } else {
      analyzed += TOTAL_STAR_COMBINATIONS
    }

    if ((numberIndex + 1) % 3500 === 0) {
      reportProgress('filter2', analyzed, TOTAL_COMBINATIONS, removed, startedAt)
    }
  })

  post({
    type: 'done',
    payload: {
      phase: 'filter2',
      bitmap: toArrayBuffer(bitmap),
      removed,
      active: countActiveBits(bitmap),
      cancelled: stopRequested,
    },
  })
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data

  try {
    if (data.type === 'stop') {
      stopRequested = true
      return
    }

    if (data.type === 'createBase') {
      applyPermanentFilters()
      return
    }

    if (data.type === 'applyFilter2') {
      applyFilter2(data.bitmap, data.history)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur worker inconnue'
    post({ type: 'error', payload: { message } })
  }
}
