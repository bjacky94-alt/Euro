import type { FilterProgress } from '../types'
import { formatDuration } from '../utils/statistics'

interface ProgressBarProps {
  progress: FilterProgress
  isProcessing: boolean
  status: 'En attente' | 'En cours' | 'Terminé' | 'Erreur'
}

const formatInt = (value: number): string =>
  new Intl.NumberFormat('fr-FR').format(value)

export function ProgressBar({ progress, isProcessing, status }: ProgressBarProps) {
  const ratio = progress.total > 0 ? Math.min(100, (progress.analyzed / progress.total) * 100) : 0
  const hasElapsed = progress.elapsedMs > 0
  const hasEta = progress.etaMs > 0
  const phaseLabel =
    progress.phase === 'createBase'
      ? 'Création de la base'
      : progress.phase === 'applyHistoricalFilter'
        ? 'Filtrage avec les tirages'
        : 'Traitement en cours'

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Traitement</h2>
        <span className={`badge ${isProcessing ? 'live' : ''}`}>
          {isProcessing ? 'En cours' : status}
        </span>
      </header>

      {isProcessing ? (
        <>
          <p className="progress-idle-text">{phaseLabel}</p>

          <div className="progress-shell" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio}>
            <div className="progress-fill" style={{ width: `${ratio}%` }} />
          </div>

          <div className="progress-metrics">
            <p>
              Analysées: <b>{formatInt(progress.analyzed)}</b> / {formatInt(progress.total)}
            </p>
            <p>
              Supprimées: <b>{formatInt(progress.removed)}</b>
            </p>
            {hasElapsed ? (
              <p>
                Temps écoulé: <b>{formatDuration(progress.elapsedMs)}</b>
              </p>
            ) : null}
            {hasEta ? (
              <p>
                Temps estimé: <b>{formatDuration(progress.etaMs)}</b>
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="progress-idle-text">
          {status === 'Terminé'
            ? 'Traitement terminé.'
            : status === 'Erreur'
              ? 'Une erreur est survenue.'
              : 'Aucun traitement en cours.'}
        </p>
      )}
    </section>
  )
}
