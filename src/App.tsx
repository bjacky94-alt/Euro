import { useEffect, useMemo, useRef, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { FiltersPanel } from './components/FiltersPanel'
import { HistoryInput } from './components/HistoryInput'
import { ProgressBar } from './components/ProgressBar'
import { ResultGenerator } from './components/ResultGenerator'
import { parseHistoryInput } from './utils/parser'
import {
  decodeCombinationIndex,
  generateMoreResults,
  replaceInactiveResults,
} from './utils/resultGenerator'
import { clearState, loadState, saveState } from './utils/storage'
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
  const [status, setStatus] = useState<'En attente' | 'En cours' | 'Terminé' | 'Erreur'>('En attente')
  const [notice, setNotice] = useState('')
  const [generatedResults, setGeneratedResults] = useState<number[]>([])
  const [requestedGeneratedCount, setRequestedGeneratedCount] = useState(10)
  const [generatorWarning, setGeneratorWarning] = useState('')

  const parsedHistory = useMemo(() => parseHistoryInput(rawHistory), [rawHistory])
  const historyRef = useRef(parsedHistory.draws)
  const generatedResultsRef = useRef(generatedResults)
  const requestedGeneratedCountRef = useRef(requestedGeneratedCount)
  const isProcessingRef = useRef(isProcessing)
  const hardTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    historyRef.current = parsedHistory.draws
  }, [parsedHistory.draws])

  useEffect(() => {
    generatedResultsRef.current = generatedResults
  }, [generatedResults])

  useEffect(() => {
    requestedGeneratedCountRef.current = requestedGeneratedCount
  }, [requestedGeneratedCount])

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  const clearHardTimeout = () => {
    if (hardTimeoutRef.current !== null) {
      window.clearTimeout(hardTimeoutRef.current)
      hardTimeoutRef.current = null
    }
  }

  const armHardTimeout = () => {
    clearHardTimeout()
    hardTimeoutRef.current = window.setTimeout(() => {
      if (!isProcessingRef.current) {
        return
      }
      worker.postMessage({ type: 'stop' })
      setIsProcessing(false)
      setStatus('Erreur')
      setNotice('Traitement interrompu: temps maximum dépassé.')
    }, 10 * 60 * 1000)
  }

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
        const restoredRequested = Math.max(1, saved.requestedGeneratedCount ?? 10)
        setRequestedGeneratedCount(restoredRequested)

        const restoredGenerated = saved.generatedResults ?? []
        const bitmapFromStorage = new Uint8Array(saved.bitmap)
        const repaired = replaceInactiveResults(bitmapFromStorage, restoredGenerated)
        setGeneratedResults(repaired)

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
        clearHardTimeout()
        setIsProcessing(false)
        setStatus('Erreur')
        setProgress((previous) => ({ ...previous, phase: 'error' }))
        setNotice(data.message)
        return
      }

      if (data.type === 'done') {
        clearHardTimeout()
        console.log('React received done')
        const nextBitmap = new Uint8Array(data.bitmap)
        const nextStats = data.stats
        const isCreateBase = data.phase === 'createBase'
        setBitmap(nextBitmap)
        setStats(nextStats)
        setProgress((previous) => ({
          ...previous,
          phase: 'done',
          analyzed: isCreateBase ? TOTAL_COMBINATIONS : previous.analyzed,
          total: isCreateBase ? TOTAL_COMBINATIONS : previous.total,
          etaMs: 0,
          removed: data.removed,
        }))
        setIsProcessing(false)
        setStatus('Terminé')

        if (data.phase === 'createBase' && !data.cancelled) {
          setBaseCreated(true)
          const repairedGenerated = replaceInactiveResults(nextBitmap, generatedResultsRef.current)
          setGeneratedResults(repairedGenerated)

          const now = new Date().toISOString()
          saveState({
            version: 2,
            bitmap: cloneBitmapBuffer(nextBitmap),
            history: historyRef.current,
            stats: nextStats,
            baseCreated: true,
            lastSavedAt: now,
            generatedResults: repairedGenerated,
            requestedGeneratedCount: requestedGeneratedCountRef.current,
          }).catch(() => {
            setNotice('Base créée, mais sauvegarde automatique échouée.')
          })
          setLastSavedAt(now)
          setNotice('Base créée: filtres 1 et 3 appliqués puis sauvegardés.')
        } else if (data.cancelled) {
          setStatus('En attente')
          setNotice('Traitement interrompu.')
        } else {
          const repairedGenerated = replaceInactiveResults(nextBitmap, generatedResultsRef.current)
          setGeneratedResults(repairedGenerated)
          setNotice('Filtrage terminé')
        }
      }
    }

    worker.addEventListener('message', onMessage)

    const onWorkerError = (event: ErrorEvent) => {
      clearHardTimeout()
      setIsProcessing(false)
      setStatus('Erreur')
      setNotice(event.message || 'Erreur non interceptée du worker.')
    }

    const onWorkerMessageError = () => {
      clearHardTimeout()
      setIsProcessing(false)
      setStatus('Erreur')
      setNotice('Erreur de sérialisation des messages worker.')
    }

    worker.addEventListener('error', onWorkerError)
    worker.addEventListener('messageerror', onWorkerMessageError)

    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onWorkerError)
      worker.removeEventListener('messageerror', onWorkerMessageError)
      clearHardTimeout()
      worker.terminate()
    }
  }, [worker])

  useEffect(() => {
    if (!bitmap || generatedResults.length === 0) {
      return
    }

    const repaired = replaceInactiveResults(bitmap, generatedResults)
    const sameLength = repaired.length === generatedResults.length
    const sameValues = sameLength && repaired.every((value, index) => value === generatedResults[index])
    if (!sameValues) {
      setGeneratedResults(repaired)
    }
  }, [bitmap, generatedResults])

  const handleCreateBase = () => {
    setNotice('')
    setIsProcessing(true)
    setStatus('En cours')
    setProgress({ ...idleProgress, phase: 'createBase' })
    armHardTimeout()
    worker.postMessage({ type: 'createBase' })
  }

  const handleRunFilter2 = () => {
    if (!bitmap) {
      setNotice('Crée ou charge une base avant le filtre 2.')
      return
    }
    if (parsedHistory.draws.length === 0) {
      setNotice('Aucun tirage valide à analyser')
      return
    }

    setNotice('')
    setIsProcessing(true)
    setStatus('En cours')
    setProgress({ ...idleProgress, phase: 'applyHistoricalFilter' })
    armHardTimeout()
    const bitmapCopy = cloneBitmapBuffer(bitmap)
    worker.postMessage(
      {
        type: 'applyHistoricalFilter',
        bitmap: bitmapCopy,
        history: parsedHistory.draws,
      },
      [bitmapCopy],
    )
  }

  const handleStop = () => {
    clearHardTimeout()
    worker.postMessage({ type: 'stop' })
    setStatus('En attente')
    setIsProcessing(false)
  }

  const handleSave = async () => {
    if (!bitmap) {
      setNotice('Aucune base à sauvegarder.')
      return
    }

    const now = new Date().toISOString()
    await saveState({
      version: 2,
      bitmap: cloneBitmapBuffer(bitmap),
      history: parsedHistory.draws,
      stats,
      baseCreated,
      lastSavedAt: now,
      generatedResults,
      requestedGeneratedCount,
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
    setStatus('En attente')
    clearHardTimeout()
    setGeneratedResults([])
    setRequestedGeneratedCount(10)
    setGeneratorWarning('')
    setNotice('Base réinitialisée.')
  }

  const handleGenerateResults = async () => {
    if (!bitmap) {
      setGeneratorWarning('Crée ou charge une base active avant de générer des résultats.')
      return
    }

    const safeRequested = Math.max(1, Math.floor(requestedGeneratedCount || 1))
    if (safeRequested !== requestedGeneratedCount) {
      setRequestedGeneratedCount(safeRequested)
    }

    const activeLimit = stats.active
    const cappedTarget = Math.min(safeRequested, activeLimit)
    if (safeRequested > activeLimit) {
      setGeneratorWarning(
        `Demande limitée à ${activeLimit.toLocaleString('fr-FR')} (nombre actif restant).`,
      )
    } else {
      setGeneratorWarning('')
    }

    const repaired = replaceInactiveResults(bitmap, generatedResults)
    const extended =
      cappedTarget > repaired.length
        ? generateMoreResults(bitmap, repaired, cappedTarget)
        : repaired

    setGeneratedResults(extended)

    try {
      const now = new Date().toISOString()
      await saveState({
        version: 2,
        bitmap: cloneBitmapBuffer(bitmap),
        history: parsedHistory.draws,
        stats,
        baseCreated,
        lastSavedAt: now,
        generatedResults: extended,
        requestedGeneratedCount: safeRequested,
      })
      setLastSavedAt(now)
    } catch {
      setNotice('Résultats générés, mais sauvegarde automatique échouée.')
    }
  }

  const visibleResults = generatedResults
    .slice(0, Math.max(0, Math.min(requestedGeneratedCount, generatedResults.length)))
    .map(decodeCombinationIndex)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-dot" aria-hidden="true" />
          <h1>EuroMillions</h1>
        </div>
        <p className="subtitle">Sélection intelligente des combinaisons.</p>

        <FiltersPanel
          canCreateBase={!baseCreated}
          canRunFilter2={Boolean(bitmap)}
          canSave={Boolean(bitmap)}
          isProcessing={isProcessing}
          onCreateBase={handleCreateBase}
          onRunFilter2={handleRunFilter2}
          onSave={handleSave}
          onReset={handleReset}
          onStop={handleStop}
        />

        {notice ? <p className={`notice ${status === 'Erreur' ? 'error' : ''}`}>{notice}</p> : null}
      </aside>

      <main className="content-grid">
        <div className="area-summary">
          <Dashboard stats={stats} baseCreated={baseCreated} lastSavedAt={lastSavedAt} />
        </div>

        <div className="area-history">
          <HistoryInput
            rawValue={rawHistory}
            onRawChange={setRawHistory}
            parsedCount={parsedHistory.draws.length}
            ignoredCount={parsedHistory.ignoredLines.length}
          />
        </div>

        <div className="area-results">
          <ResultGenerator
            requestedCount={requestedGeneratedCount}
            onRequestedCountChange={(value) =>
              setRequestedGeneratedCount(Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1))
            }
            onGenerate={handleGenerateResults}
            visibleResults={visibleResults}
            warning={generatorWarning}
            disabled={!bitmap || isProcessing}
          />
        </div>

        <div className="area-progress">
          <ProgressBar progress={progress} isProcessing={isProcessing} status={status} />
        </div>
      </main>
    </div>
  )
}

export default App
