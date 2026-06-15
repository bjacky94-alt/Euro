import type { StatisticsSnapshot } from '../types'

interface DashboardProps {
  stats: StatisticsSnapshot
  baseCreated: boolean
}

const formatInt = (value: number): string =>
  new Intl.NumberFormat('fr-FR').format(value)

export function Dashboard({ stats, baseCreated }: DashboardProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Résumé</h2>
      </header>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Total</span>
          <strong>{formatInt(stats.total)}</strong>
        </article>
        <article className="stat-card">
          <span>Combinaisons restantes</span>
          <strong>{formatInt(stats.active)}</strong>
        </article>
        <article className="stat-card danger">
          <span>Supprimées</span>
          <strong>{formatInt(stats.removed)}</strong>
        </article>
        <article className="stat-card accent">
          <span>Pourcentage restant</span>
          <strong>{stats.percentageRemaining.toFixed(3)}%</strong>
        </article>
      </div>

      <div className="meta-list">
        <p>
          Etat base: <b>{baseCreated ? 'Présente' : 'Absente'}</b>
        </p>
      </div>
    </section>
  )
}
