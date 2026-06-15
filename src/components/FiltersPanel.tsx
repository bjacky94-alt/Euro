interface FiltersPanelProps {
  canCreateBase: boolean
  canRunFilter2: boolean
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
        <h2>Moteur de filtres</h2>
      </header>

      <div className="button-grid">
        <button type="button" onClick={onCreateBase} disabled={!canCreateBase || isProcessing}>
          Créer base (Filtre 1 + 3)
        </button>

        <button type="button" onClick={onRunFilter2} disabled={!canRunFilter2 || isProcessing}>
          Appliquer Filtre 2
        </button>

        <button type="button" className="ghost" onClick={onSave} disabled={isProcessing}>
          Sauvegarder
        </button>

        <button type="button" className="danger" onClick={onReset} disabled={isProcessing}>
          Réinitialiser
        </button>
      </div>

      <button type="button" className="warning" onClick={onStop} disabled={!isProcessing}>
        Interrompre traitement
      </button>
    </section>
  )
}
