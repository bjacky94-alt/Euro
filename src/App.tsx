import { useEffect, useMemo, useRef, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { FiltersPanel } from './components/FiltersPanel'
import { Filter2Panel } from './components/Filter2Panel'
import type { Filter2Summary } from './components/Filter2Panel'
import { ProgressBar } from './components/ProgressBar'
import { ResultGenerator } from './components/ResultGenerator'
import { parseHistoryInput } from './utils/parser'
import { countActiveBits } from './utils/bitmap'
import {
  decodeCombinationIndex,
  generateMoreResults,
  replaceInactiveResults,
} from './utils/resultGenerator'
import { clearState, loadState, saveState } from './utils/storage'
import {
  TOTAL_COMBINATIONS,
  type Draw,
  type FilterProgress,
  type PersistedState,
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

interface PortableBackup {
  version: 1
  exportedAt: string
  state: Omit<PersistedState, 'bitmap'> & {
    bitmapBase64: string
  }
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const fromBase64 = (base64: string): Uint8Array => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function App() {
  const worker = useMemo(
    () => new Worker(new URL('./workers/filterWorker.ts', import.meta.url), { type: 'module' }),
    [],
  )

  const [bitmap, setBitmap] = useState<Uint8Array | null>(null)
  const [stats, setStats] = useState<StatisticsSnapshot>(defaultStats)
  const [baseCreated, setBaseCreated] = useState(false)
  const [rawHistory, setRawHistory] = useState('')
  const [filter2Summary, setFilter2Summary] = useState<Filter2Summary | null>(null)
  const [progress, setProgress] = useState<FilterProgress>(idleProgress)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isFilter2Running, setIsFilter2Running] = useState(false)
  const [isInitializingBase, setIsInitializingBase] = useState(false)
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
  const isInitializingBaseRef = useRef(isInitializingBase)
  const isFilter2RunningRef = useRef(isFilter2Running)
  const lastFilter2ProgressRef = useRef<FilterProgress | null>(null)
  const hardTimeoutRef = useRef<number | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    generatedResultsRef.current = generatedResults
  }, [generatedResults])

  useEffect(() => {
    requestedGeneratedCountRef.current = requestedGeneratedCount
  }, [requestedGeneratedCount])

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  useEffect(() => {
    isInitializingBaseRef.current = isInitializingBase
  }, [isInitializingBase])

  useEffect(() => {
    isFilter2RunningRef.current = isFilter2Running
  }, [isFilter2Running])

  const startBaseInitialization = () => {
    if (isProcessingRef.current || isInitializingBaseRef.current) {
      return
    }

    setIsInitializingBase(true)
    setNotice('Création de la base en cours...')
    setIsProcessing(true)
    setStatus('En cours')
    setProgress({ ...idleProgress, phase: 'createBase' })
    armHardTimeout('createBase')
    worker.postMessage({ type: 'createBase' })
  }

  const clearHardTimeout = () => {
    if (hardTimeoutRef.current !== null) {
      window.clearTimeout(hardTimeoutRef.current)
      hardTimeoutRef.current = null
    }
  }

  const armHardTimeout = (phase: 'createBase' | 'applyHistoricalFilter') => {
    clearHardTimeout()
    const timeoutMs = phase === 'createBase' ? 30 * 60 * 1000 : 10 * 60 * 1000
    hardTimeoutRef.current = window.setTimeout(() => {
      if (!isProcessingRef.current) {
        return
      }
      worker.postMessage({ type: 'stop' })
      setIsProcessing(false)
      setIsInitializingBase(false)
      setStatus('Erreur')
      setNotice('Traitement interrompu: temps maximum dépassé.')
    }, timeoutMs)
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data
      if (data.type === 'progress') {
        setProgress(data.payload)
        if (data.payload.phase === 'applyHistoricalFilter') {
          lastFilter2ProgressRef.current = data.payload
        }
        return
      }

      if (data.type === 'error') {
        clearHardTimeout()
        setIsProcessing(false)
        setIsFilter2Running(false)
        setIsInitializingBase(false)
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
        setBitmap(nextBitmap)
        setStats(nextStats)
        setProgress({ ...idleProgress, phase: 'idle' })
        setIsProcessing(false)
        setIsFilter2Running(false)
        setIsInitializingBase(false)
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
          setNotice('Base prête')
        } else if (data.cancelled) {
          setStatus('En attente')
          setIsInitializingBase(false)
          setNotice('Traitement interrompu.')
          if (data.phase === 'applyHistoricalFilter') {
            const lastP = lastFilter2ProgressRef.current
            setFilter2Summary({
              analyzed: lastP?.analyzed ?? 0,
              deleted: data.removed,
              remaining: data.stats.active,
              elapsedMs: lastP?.elapsedMs ?? 0,
              cancelled: true,
            })
            lastFilter2ProgressRef.current = null
          }
        } else {
          const lastP = lastFilter2ProgressRef.current
          setFilter2Summary({
            analyzed: lastP?.analyzed ?? data.stats.total,
            deleted: data.removed,
            remaining: data.stats.active,
            elapsedMs: lastP?.elapsedMs ?? 0,
            cancelled: false,
          })
          lastFilter2ProgressRef.current = null
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
      setIsFilter2Running(false)
      setIsInitializingBase(false)
      setStatus('Erreur')
      setNotice(event.message || 'Erreur non interceptée du worker.')
    }

    const onWorkerMessageError = () => {
      clearHardTimeout()
      setIsProcessing(false)
      setIsFilter2Running(false)
      setIsInitializingBase(false)
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
    loadState()
      .then((saved) => {
        if (saved) {
          setBitmap(new Uint8Array(saved.bitmap))
          setStats(saved.stats)
          setBaseCreated(true)
          setStatus('Terminé')
          setRawHistory(
            saved.history
              .map((draw) => `${draw.numbers.join(' ')} ${draw.stars.join(' ')}`)
              .join('\n'),
          )
          const restoredRequested = Math.max(1, saved.requestedGeneratedCount ?? 10)
          setRequestedGeneratedCount(restoredRequested)

          const restoredGenerated = saved.generatedResults ?? []
          const bitmapFromStorage = new Uint8Array(saved.bitmap)
          const repaired = replaceInactiveResults(bitmapFromStorage, restoredGenerated)
          setGeneratedResults(repaired)
          setNotice('Base chargée automatiquement depuis IndexedDB.')
          return
        }

        window.setTimeout(() => {
          startBaseInitialization()
        }, 0)
      })
      .catch(() => {
        setNotice('Impossible de charger la base sauvegardée.')
        window.setTimeout(() => {
          startBaseInitialization()
        }, 0)
      })
  }, [])

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

  const handleRunFilter2 = () => {
    if (isProcessingRef.current || isInitializingBaseRef.current || isFilter2RunningRef.current) {
      return
    }
    if (!bitmap) {
      setNotice('Base absente')
      return
    }
    if (parsedHistory.draws.length === 0) {
      setNotice('Aucun tirage valide à analyser')
      return
    }

    const activeCount = countActiveBits(bitmap)
    setFilter2Summary(null)
    setNotice('')
    setIsFilter2Running(true)
    setIsProcessing(true)
    setStatus('En cours')
    setProgress({
      ...idleProgress,
      phase: 'applyHistoricalFilter',
      total: activeCount,
      analyzed: 0,
      removed: 0,
    })
    armHardTimeout('applyHistoricalFilter')
    const bitmapCopy = cloneBitmapBuffer(bitmap)
    worker.postMessage(
      { type: 'applyHistoricalFilter', bitmap: bitmapCopy, history: parsedHistory.draws },
      [bitmapCopy],
    )
  }

  const handleStop = () => {
    clearHardTimeout()
    worker.postMessage({ type: 'stop' })
    setStatus('En attente')
    setIsInitializingBase(false)
    setIsFilter2Running(false)
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
      history: historyRef.current,
      stats,
      baseCreated,
      lastSavedAt: now,
      generatedResults,
      requestedGeneratedCount,
    })
    setNotice('Sauvegarde effectuée dans IndexedDB.')
  }

  const handleExportBackup = async () => {
    let state = await loadState()

    if (!state && bitmap) {
      state = {
        version: 2,
        bitmap: cloneBitmapBuffer(bitmap),
        history: historyRef.current,
        stats,
        baseCreated,
        lastSavedAt: new Date().toISOString(),
        generatedResults,
        requestedGeneratedCount,
      }
    }

    if (!state) {
      setNotice('Aucune sauvegarde à exporter.')
      return
    }

    const payload: PortableBackup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      state: {
        ...state,
        bitmapBase64: toBase64(new Uint8Array(state.bitmap)),
      },
    }

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `euromillions-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)

    setNotice('Sauvegarde exportée. Ajoute ce fichier sur GitHub pour la retrouver partout.')
  }

  const handleImportBackup = () => {
    importInputRef.current?.click()
  }

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as PortableBackup

      if (!parsed?.state?.bitmapBase64) {
        throw new Error('Format invalide')
      }

      const bitmapBytes = fromBase64(parsed.state.bitmapBase64)
      const importedState: PersistedState = {
        version: 2,
        bitmap: cloneBitmapBuffer(bitmapBytes),
        history: (parsed.state.history ?? []) as Draw[],
        stats: parsed.state.stats,
        baseCreated: parsed.state.baseCreated,
        lastSavedAt: parsed.state.lastSavedAt,
        generatedResults: parsed.state.generatedResults ?? [],
        requestedGeneratedCount: Math.max(1, parsed.state.requestedGeneratedCount ?? 10),
      }

      await saveState(importedState)

      const bitmapFromImport = new Uint8Array(importedState.bitmap)
      const repaired = replaceInactiveResults(bitmapFromImport, importedState.generatedResults ?? [])

      setBitmap(bitmapFromImport)
      setStats(importedState.stats)
      setBaseCreated(importedState.baseCreated)
      setRawHistory(
        importedState.history
          .map((draw) => `${draw.numbers.join(' ')} ${draw.stars.join(' ')}`)
          .join('\n'),
      )
      setRequestedGeneratedCount(importedState.requestedGeneratedCount ?? 10)
      setGeneratedResults(repaired)
      setStatus('Terminé')
      setNotice('Sauvegarde importée depuis fichier GitHub.')
    } catch {
      setNotice('Impossible d\'importer cette sauvegarde.')
    } finally {
      event.target.value = ''
    }
  }

  const handleReset = async () => {
    if (isProcessingRef.current || isInitializingBaseRef.current) {
      return
    }

    await clearState()
    setBitmap(null)
    setStats(defaultStats)
    setBaseCreated(false)
    setProgress(idleProgress)
    setStatus('En attente')
    clearHardTimeout()
    setFilter2Summary(null)
    setGeneratedResults([])
    setRequestedGeneratedCount(10)
    setGeneratorWarning('')
    setNotice('Base réinitialisée. Création automatique en cours...')

    window.setTimeout(() => {
      startBaseInitialization()
    }, 0)
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
        history: historyRef.current,
        stats,
        baseCreated,
        lastSavedAt: now,
        generatedResults: extended,
        requestedGeneratedCount: safeRequested,
      })
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
          canSave={Boolean(bitmap) && baseCreated}
          isProcessing={isProcessing || isInitializingBase}
          isInitializingBase={isInitializingBase}
          onSave={handleSave}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onReset={handleReset}
          onStop={handleStop}
        />

        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleImportFileChange}
        />

        {notice ? <p className={`notice ${status === 'Erreur' ? 'error' : ''}`}>{notice}</p> : null}
      </aside>

      <main className="content-grid">
        <div className="area-summary">
          <Dashboard stats={stats} baseCreated={baseCreated} />
        </div>

        <div className="area-filter2">
          <Filter2Panel
            rawHistory={rawHistory}
            onRawHistoryChange={setRawHistory}
            parsedCount={parsedHistory.draws.length}
            ignoredCount={parsedHistory.ignoredLines.length}
            canRun={Boolean(bitmap) && baseCreated && !isInitializingBase}
            isRunning={isFilter2Running}
            progress={progress}
            summary={filter2Summary}
            onRun={handleRunFilter2}
            onStop={handleStop}
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
            disabled={!bitmap || isProcessing || isInitializingBase}
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
