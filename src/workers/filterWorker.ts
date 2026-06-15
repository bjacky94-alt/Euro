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

const post = (message: WorkerResponse, transfer?: Transferable[]): void => {
  if (transfer && transfer.length > 0) {
    ctx.postMessage(message, transfer)
  } else {
    ctx.postMessage(message)
  }
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

const STAR_PAIRS: [number, number][] = (() => {
  const pairs: [number, number][] = []
  for (let s1 = 1; s1 <= 11; s1 += 1) {
    for (let s2 = s1 + 1; s2 <= 12; s2 += 1) {
      pairs.push([s1, s2])
    }
  }
  return pairs
})()

const CHOOSE: number[][] = (() => {
  const table = Array.from({ length: 51 }, () => Array(6).fill(0))
  for (let n = 0; n <= 50; n += 1) {
    table[n][0] = 1
    for (let k = 1; k <= Math.min(5, n); k += 1) {
      table[n][k] = k === n ? 1 : table[n - 1][k - 1] + table[n - 1][k]
    }
  }
  return table
})()

const decodeNumberCombination = (rankInput: number): [number, number, number, number, number] => {
  let rank = rankInput
  const result: number[] = []
  let previous = 0

  for (let i = 0; i < 5; i += 1) {
    for (let value = previous + 1; value <= 50; value += 1) {
      const count = CHOOSE[50 - value][5 - i - 1]
      if (rank < count) {
        result.push(value)
        previous = value
        break
      }
      rank -= count
    }
  }

  return result as [number, number, number, number, number]
}

const hasAtLeastThreeNumberMatches = (
  combo: readonly [number, number, number, number, number],
  draw: readonly [number, number, number, number, number],
): boolean => {
  let i = 0
  let j = 0
  let matches = 0
  while (i < 5 && j < 5) {
    if (combo[i] === draw[j]) {
      matches += 1
      if (matches >= 3) {
        return true
      }
      i += 1
      j += 1
    } else if (combo[i] < draw[j]) {
      i += 1
    } else {
      j += 1
    }
  }
  return false
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
  let deletedCount = 0

  if (history.length === 0) {
    post({
      type: 'error',
      message: 'Aucun tirage valide à analyser',
    })
    return
  }

  console.log('Filter 2 started')

  const activeCount = countActiveBits(bitmap)
  console.log('Active combinations to analyze:', activeCount)

  reportProgress('filter2', 0, activeCount, 0, startedAt)
  await waitTick()

  const drawData = history.map((draw) => ({
    numbers: draw.numbers,
    stars: draw.stars,
  }))

  const CHUNK_SIZE = 100000
  let analyzedActive = 0
  let cachedNumberIndex = -1
  let cachedNumbers: [number, number, number, number, number] = [1, 2, 3, 4, 5]

  for (let byteIndex = 0; byteIndex < bitmap.length; byteIndex += 1) {
    if (stopRequested) {
      break
    }

    const byteValue = bitmap[byteIndex]
    if (byteValue === 0) {
      continue
    }

    for (let bit = 0; bit < 8; bit += 1) {
      if ((byteValue & (1 << bit)) === 0) {
        continue
      }

      const bitIndex = (byteIndex << 3) + bit
      if (bitIndex >= TOTAL_COMBINATIONS) {
        break
      }

      analyzedActive += 1

      const numberIndex = Math.floor(bitIndex / TOTAL_STAR_COMBINATIONS)
      const starIndex = bitIndex % TOTAL_STAR_COMBINATIONS
      if (numberIndex !== cachedNumberIndex) {
        cachedNumberIndex = numberIndex
        cachedNumbers = decodeNumberCombination(numberIndex)
      }

      const [s1, s2] = STAR_PAIRS[starIndex]
      let shouldDelete = false

      for (const draw of drawData) {
        if (!hasAtLeastThreeNumberMatches(cachedNumbers, draw.numbers)) {
          continue
        }

        const matchedStars =
          (s1 === draw.stars[0] || s1 === draw.stars[1] ? 1 : 0) +
          (s2 === draw.stars[0] || s2 === draw.stars[1] ? 1 : 0)

        if (matchedStars >= 1) {
          shouldDelete = true
          break
        }
      }

      if (shouldDelete && clearBit(bitmap, bitIndex)) {
        deletedCount += 1
      }

      if (analyzedActive % CHUNK_SIZE === 0) {
        console.log('Filter 2 progress:', analyzedActive, '/', activeCount)
        console.log('Filter 2 deleted:', deletedCount)
        reportProgress('filter2', analyzedActive, activeCount, deletedCount, startedAt)
        await waitTick()

        if (stopRequested) {
          break
        }
      }
    }
  }

  reportProgress('filter2', analyzedActive, activeCount, deletedCount, startedAt)
  console.log('Filter 2 done')

  const finalBitmap = toArrayBuffer(bitmap)
  post(
    {
      type: 'done',
      phase: 'filter2',
      bitmap: finalBitmap,
      stats: buildStats(bitmap),
      removed: deletedCount,
      cancelled: stopRequested,
    },
    [finalBitmap],
  )
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
