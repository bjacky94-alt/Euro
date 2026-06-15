export const TOTAL_NUMBER_COMBINATIONS = 2_118_760
export const TOTAL_STAR_COMBINATIONS = 66
export const TOTAL_COMBINATIONS = 139_838_160

export type FilterPhase = 'idle' | 'createBase' | 'applyHistoricalFilter' | 'done' | 'error'

export interface Draw {
  numbers: [number, number, number, number, number]
  stars: [number, number]
}

export interface FilterProgress {
  phase: FilterPhase
  analyzed: number
  total: number
  removed: number
  elapsedMs: number
  etaMs: number
}

export interface StatisticsSnapshot {
  total: number
  active: number
  removed: number
  percentageRemaining: number
}

export interface PersistedState {
  version: 1 | 2
  bitmap: ArrayBuffer
  history: Draw[]
  stats: StatisticsSnapshot
  baseCreated: boolean
  lastSavedAt: string
  generatedResults?: number[]
  requestedGeneratedCount?: number
}

export type WorkerRequest =
  | { type: 'createBase' }
  | { type: 'applyHistoricalFilter'; bitmap: ArrayBuffer; history: Draw[] }
  | { type: 'stop' }

export type WorkerResponse =
  | { type: 'progress'; payload: FilterProgress }
  | {
      type: 'done'
      phase: 'createBase' | 'applyHistoricalFilter'
      bitmap: ArrayBuffer
      stats: StatisticsSnapshot
      removed: number
      cancelled: boolean
    }
  | { type: 'error'; message: string }
