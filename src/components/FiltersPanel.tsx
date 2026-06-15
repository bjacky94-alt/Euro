interface FiltersPanelProps {
  canSave: boolean
  isProcessing: boolean
  isInitializingBase: boolean
  onLoad: () => void
  onSave: () => void
  onReset: () => void
  onStop: () => void
}

export function FiltersPanel({
  canSave,
  isProcessing,
  isInitializingBase,
  onLoad,
  onSave,
  onReset,
  onStop,
}: FiltersPanelProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Actions</h2>
      </header>

      <div className="button-grid">
        <button type="button" onClick={onLoad} disabled={isProcessing}>
          Charger
        </button>

        <button type="button" onClick={onSave} disabled={!canSave || isProcessing}>
          Sauvegarder
        </button>

        <button type="button" className="danger" onClick={onReset} disabled={isProcessing}>
          Réinitialiser la base
        </button>
      </div>

      <button type="button" className="warning" onClick={onStop} disabled={!isProcessing}>
        Arrêter
      </button>

      {isInitializingBase ? <p className="progress-idle-text">Création de la base en cours...</p> : null}
    </section>
  )
}
