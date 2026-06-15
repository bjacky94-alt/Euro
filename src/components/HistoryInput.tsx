interface HistoryInputProps {
  rawValue: string
  onRawChange: (value: string) => void
  parsedCount: number
  ignoredCount: number
}

export function HistoryInput({
  rawValue,
  onRawChange,
  parsedCount,
  ignoredCount,
}: HistoryInputProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Tirages déjà sortis</h2>
      </header>

      <textarea
        value={rawValue}
        onChange={(event) => onRawChange(event.target.value)}
        placeholder={'Format : 5 numéros (1-50) puis 2 étoiles (1-12) par ligne\n\n28 16 20 22 11 4 9\n38 40 25 15 41 1 2\n22 45 48 11 36 1 4'}
      />

      <div className="meta-list">
        <p>
          Tirages valides: <b>{parsedCount}</b>
        </p>
        <p>
          Lignes ignorées: <b>{ignoredCount}</b>
        </p>
      </div>
    </section>
  )
}
