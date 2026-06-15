import { countActiveBits } from './bitmap'
import { TOTAL_COMBINATIONS } from '../types'
import type { StatisticsSnapshot } from '../types'

export const computeStatistics = (bitmap: Uint8Array): StatisticsSnapshot => {
  const active = countActiveBits(bitmap)
  const removed = TOTAL_COMBINATIONS - active
  const percentageRemaining = (active / TOTAL_COMBINATIONS) * 100

  return {
    total: TOTAL_COMBINATIONS,
    active,
    removed,
    percentageRemaining,
  }
}

export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0s'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}
