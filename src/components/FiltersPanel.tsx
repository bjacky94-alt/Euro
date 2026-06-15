interface FiltersPanelProps {
  canCreateBase: boolean
  canRunFilter2: boolean
  canSave: boolean
  isProcessing: boolean
  onCreateBase: () => void
  onRunFilter2: () => void
  onSave: () => void
  onReset: () => void
  onStop: () => void
}

export function FiltersPanel({
  canCreateBase,
  canRunFilter2,
  canSave,
  isProcessing,
  onCreateBase,
  onRunFilter2,
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
        <button type="button" onClick={onCreateBase} disabled={!canCreateBase || isProcessing}>
          Créer la base
        </button>

        <button type="button" onClick={onRunFilter2} disabled={!canRunFilter2 || isProcessing}>
          Filtrer avec les tirages
        </button>

        <button type="button" className="ghost" onClick={onSave} disabled={isProcessing || !canSave}>
          Sauvegarder
        </button>

        <button type="button" className="danger" onClick={onReset} disabled={isProcessing}>
          Réinitialiser la base
        </button>
      </div>

      <button type="button" className="warning" onClick={onStop} disabled={!isProcessing}>
        Arrêter
      </button>
    </section>
  )
}
