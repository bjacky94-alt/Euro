import type { FilterProgress } from '../types'

const fmt = (n: number): string => new Intl.NumberFormat('fr-FR').format(n)

const formatHHMMSS = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export interface Filter2Summary {
  analyzed: number
  deleted: number
  remaining: number
  elapsedMs: number
  cancelled: boolean
}

interface Filter2PanelProps {
  rawHistory: string
  onRawHistoryChange: (value: string) => void
  parsedCount: number
  ignoredCount: number
  canRun: boolean
  isRunning: boolean
  progress: FilterProgress
  summary: Filter2Summary | null
  onRun: () => void
  onStop: () => void
}

export function Filter2Panel({
  rawHistory,
  onRawHistoryChange,
  parsedCount,
  ignoredCount,
  canRun,
  isRunning,
  progress,
  summary,
  onRun,
  onStop,
}: Filter2PanelProps) {
  const isFilter2Active = isRunning && progress.phase === 'applyHistoricalFilter'

  const pct =
    progress.total > 0 ? Math.min(100, (progress.analyzed / progress.total) * 100) : 0
  const pctStr = pct.toFixed(1)

  const speedPerSec =
    progress.elapsedMs > 500
      ? Math.round((progress.analyzed / progress.elapsedMs) * 1000)
      : 0

  const remainingCombinations = Math.max(0, progress.total - progress.removed)

  const statusText = isFilter2Active
    ? 'Analyse en cours...'
    : summary?.cancelled
      ? 'Filtrage interrompu'
      : summary
        ? 'Filtrage terminé'
        : 'En attente'

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Filtre 2 — Tirages historiques</h2>
        <span className={`badge ${isFilter2Active ? 'live' : ''}`}>{statusText}</span>
      </header>

      <textarea
        value={rawHistory}
        onChange={(event) => onRawHistoryChange(event.target.value)}
        placeholder={
          'Format : 5 numéros (1-50) puis 2 étoiles (1-12) par ligne\n\n28 16 20 22 11 4 9\n38 40 25 15 41 1 2\n22 45 48 11 36 1 4'
        }
        disabled={isRunning}
        style={{ minHeight: '130px' }}
      />

      <div className="meta-list" style={{ marginBottom: '10px' }}>
        <p>
          Tirages valides: <b>{parsedCount}</b>
        </p>
        {ignoredCount > 0 && (
          <p>
            Lignes ignorées: <b>{ignoredCount}</b>
          </p>
        )}
      </div>

      <div className="filter2-actions">
        <button type="button" onClick={onRun} disabled={!canRun || isRunning}>
          Filtrer avec les tirages
        </button>
        <button type="button" className="warning" onClick={onStop} disabled={!isFilter2Active}>
          Arrêter
        </button>
      </div>

      {isFilter2Active && (
        <div className="filter2-progress">
          <div
            className="filter2-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="filter2-bar-fill" style={{ width: `${pct}%` }} />
            <span className="filter2-bar-pct">{pctStr} %</span>
          </div>

          <div className="f2-metrics">
            <div className="f2-row">
              <span>Progression</span>
              <b>{pctStr} %</b>
            </div>
            <div className="f2-row">
              <span>Combinaisons analysées</span>
              <b>
                {fmt(progress.analyzed)} / {fmt(progress.total)}
              </b>
            </div>
            <div className="f2-row">
              <span>Combinaisons supprimées</span>
              <b>{fmt(progress.removed)}</b>
            </div>
            <div className="f2-row">
              <span>Combinaisons restantes</span>
              <b>{fmt(remainingCombinations)}</b>
            </div>
            <div className="f2-row">
              <span>Tirages valides</span>
              <b>{fmt(parsedCount)}</b>
            </div>
            <div className="f2-row">
              <span>Temps écoulé</span>
              <b>{formatHHMMSS(progress.elapsedMs)}</b>
            </div>
            {progress.etaMs > 0 && (
              <div className="f2-row">
                <span>Temps restant estimé</span>
                <b>{formatHHMMSS(progress.etaMs)}</b>
              </div>
            )}
            {speedPerSec > 0 && (
              <div className="f2-row">
                <span>Vitesse</span>
                <b>{fmt(speedPerSec)} combinaisons/s</b>
              </div>
            )}
          </div>
        </div>
      )}

      {summary && !isFilter2Active && (
        <div className="filter2-summary">
          <p className="filter2-summary-title">
            {summary.cancelled ? '⚠ Filtrage interrompu' : '✓ Filtrage terminé'}
          </p>
          <div className="f2-metrics">
            <div className="f2-row">
              <span>Combinaisons analysées</span>
              <b>{fmt(summary.analyzed)}</b>
            </div>
            <div className="f2-row">
              <span>Combinaisons supprimées</span>
              <b>{fmt(summary.deleted)}</b>
            </div>
            <div className="f2-row">
              <span>Combinaisons restantes</span>
              <b>{fmt(summary.remaining)}</b>
            </div>
            <div className="f2-row">
              <span>Temps total</span>
              <b>{formatHHMMSS(summary.elapsedMs)}</b>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
