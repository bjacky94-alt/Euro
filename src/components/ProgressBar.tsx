import type { FilterProgress } from '../types'
import { formatDuration } from '../utils/statistics'

interface ProgressBarProps {
  progress: FilterProgress
  isProcessing: boolean
}

const formatInt = (value: number): string =>
  new Intl.NumberFormat('fr-FR').format(value)

export function ProgressBar({ progress, isProcessing }: ProgressBarProps) {
  const ratio = progress.total > 0 ? Math.min(100, (progress.analyzed / progress.total) * 100) : 0

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Progression</h2>
        <span className={`badge ${isProcessing ? 'live' : ''}`}>
          {isProcessing ? 'En cours' : 'En attente'}
        </span>
      </header>

      <div className="progress-shell" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio}>
        <div className="progress-fill" style={{ width: `${ratio}%` }} />
      </div>

      <div className="progress-metrics">
        <p>
          Phase: <b>{progress.phase}</b>
        </p>
        <p>
          Analysées: <b>{formatInt(progress.analyzed)}</b> / {formatInt(progress.total)}
        </p>
        <p>
          Supprimées (run): <b>{formatInt(progress.removed)}</b>
        </p>
        <p>
          Temps écoulé: <b>{formatDuration(progress.elapsedMs)}</b>
        </p>
        <p>
          Temps estimé: <b>{formatDuration(progress.etaMs)}</b>
        </p>
      </div>
    </section>
  )
}
