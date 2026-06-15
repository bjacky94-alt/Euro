import { useEffect, useMemo, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { FiltersPanel } from './components/FiltersPanel'
import { HistoryInput } from './components/HistoryInput'
import { ProgressBar } from './components/ProgressBar'
import { Statistics } from './components/Statistics'
import { parseHistoryInput } from './utils/parser'
import { clearState, loadState, saveState } from './utils/storage'
import { computeStatistics } from './utils/statistics'
import {
  TOTAL_COMBINATIONS,
  type FilterProgress,
  type StatisticsSnapshot,
  type WorkerResponse,
} from './types'

const defaultStats: StatisticsSnapshot = {
  total: TOTAL_COMBINATIONS,
  active: 0,
  removed: TOTAL_COMBINATIONS,
  percentageRemaining: 0,
}

const idleProgress: FilterProgress = {
  phase: 'idle',
  analyzed: 0,
  total: TOTAL_COMBINATIONS,
  removed: 0,
  elapsedMs: 0,
  etaMs: 0,
}

const cloneBitmapBuffer = (bitmap: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bitmap)
  return copy.buffer
}

function App() {
  const worker = useMemo(
    () => new Worker(new URL('./workers/filterWorker.ts', import.meta.url), { type: 'module' }),
    [],
  )

  const [bitmap, setBitmap] = useState<Uint8Array | null>(null)
  const [stats, setStats] = useState<StatisticsSnapshot>(defaultStats)
  const [baseCreated, setBaseCreated] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [rawHistory, setRawHistory] = useState('')
  const [progress, setProgress] = useState<FilterProgress>(idleProgress)
  const [isProcessing, setIsProcessing] = useState(false)
  const [notice, setNotice] = useState('')

  const parsedHistory = useMemo(() => parseHistoryInput(rawHistory), [rawHistory])

  useEffect(() => {
    loadState()
      .then((saved) => {
        if (!saved) {
          return
        }
        setBitmap(new Uint8Array(saved.bitmap))
        setStats(saved.stats)
        setBaseCreated(saved.baseCreated)
        setLastSavedAt(saved.lastSavedAt)
        setRawHistory(
          saved.history
            .map((draw) => `${draw.numbers.join(' ')} + ${draw.stars.join(' ')}`)
            .join('\n'),
        )
        setNotice('Base chargée automatiquement depuis IndexedDB.')
      })
      .catch(() => {
        setNotice('Impossible de charger la base sauvegardée.')
      })
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data
      if (data.type === 'progress') {
        setProgress(data.payload)
        return
      }

      if (data.type === 'error') {
        setIsProcessing(false)
        setNotice(data.payload.message)
        return
      }

      if (data.type === 'done') {
        const nextBitmap = new Uint8Array(data.payload.bitmap)
        const nextStats = computeStatistics(nextBitmap)
        setBitmap(nextBitmap)
        setStats(nextStats)
        setProgress((previous) => ({ ...previous, phase: 'idle', etaMs: 0 }))
        setIsProcessing(false)

        if (data.payload.phase === 'createBase' && !data.payload.cancelled) {
          setBaseCreated(true)
          const now = new Date().toISOString()
          saveState({
            version: 1,
            bitmap: cloneBitmapBuffer(nextBitmap),
            history: parsedHistory.draws,
            stats: nextStats,
            baseCreated: true,
            lastSavedAt: now,
          }).catch(() => {
            setNotice('Base créée, mais sauvegarde automatique échouée.')
          })
          setLastSavedAt(now)
          setNotice('Base créée: filtres 1 et 3 appliqués puis sauvegardés.')
        } else if (data.payload.cancelled) {
          setNotice('Traitement interrompu.')
        } else {
          setNotice('Filtre 2 terminé.')
        }
      }
    }

    worker.addEventListener('message', onMessage)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    }
  }, [worker, parsedHistory.draws])

  const handleCreateBase = () => {
    setNotice('')
    setIsProcessing(true)
    setProgress({ ...idleProgress, phase: 'createBase' })
    worker.postMessage({ type: 'createBase' })
  }

  const handleRunFilter2 = () => {
    if (!bitmap) {
      setNotice('Crée ou charge une base avant le filtre 2.')
      return
    }
    if (parsedHistory.draws.length === 0) {
      setNotice('Ajoute au moins un tirage historique valide.')
      return
    }

    setNotice('')
    setIsProcessing(true)
    setProgress({ ...idleProgress, phase: 'filter2' })
    const bitmapCopy = cloneBitmapBuffer(bitmap)
    worker.postMessage(
      {
        type: 'applyFilter2',
        bitmap: bitmapCopy,
        history: parsedHistory.draws,
      },
      [bitmapCopy],
    )
  }

  const handleStop = () => {
    worker.postMessage({ type: 'stop' })
  }

  const handleSave = async () => {
    if (!bitmap) {
      setNotice('Aucune base à sauvegarder.')
      return
    }

    const now = new Date().toISOString()
    await saveState({
      version: 1,
      bitmap: cloneBitmapBuffer(bitmap),
      history: parsedHistory.draws,
      stats,
      baseCreated,
      lastSavedAt: now,
    })
    setLastSavedAt(now)
    setNotice('Sauvegarde effectuée dans IndexedDB.')
  }

  const handleReset = async () => {
    await clearState()
    setBitmap(null)
    setStats(defaultStats)
    setBaseCreated(false)
    setLastSavedAt(null)
    setProgress(idleProgress)
    setNotice('Base réinitialisée.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>EuroMillions Smart Filter</h1>
        <p>
          Moteur local sur bitmap binaire de <strong>139 838 160</strong> combinaisons.
        </p>

        <FiltersPanel
          canCreateBase={!baseCreated}
          canRunFilter2={Boolean(bitmap)}
          isProcessing={isProcessing}
          onCreateBase={handleCreateBase}
          onRunFilter2={handleRunFilter2}
          onSave={handleSave}
          onReset={handleReset}
          onStop={handleStop}
        />

        {notice ? <p className="notice">{notice}</p> : null}
      </aside>

      <main className="content-grid">
        <Dashboard stats={stats} baseCreated={baseCreated} lastSavedAt={lastSavedAt} />
        <ProgressBar progress={progress} isProcessing={isProcessing} />
        <HistoryInput
          rawValue={rawHistory}
          onRawChange={setRawHistory}
          parsedCount={parsedHistory.draws.length}
          ignoredCount={parsedHistory.ignoredLines.length}
        />
        <Statistics historyCount={parsedHistory.draws.length} hasBitmap={Boolean(bitmap)} />
      </main>
    </div>
  )
}

export default App
