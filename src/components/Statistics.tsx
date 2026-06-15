interface StatisticsProps {
  historyCount: number
  hasBitmap: boolean
}

export function Statistics({ historyCount, hasBitmap }: StatisticsProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Statistiques métier</h2>
      </header>

      <div className="meta-list">
        <p>
          Filtre 1 (suite &gt;= 3 numéros): <b>Permanent</b>
        </p>
        <p>
          Filtre 3 (même chiffre des unités): <b>Permanent</b>
        </p>
        <p>
          Filtre 2 (3 numéros + 1 étoile): <b>À la demande</b>
        </p>
        <p>
          Tirages historiques chargés: <b>{historyCount}</b>
        </p>
        <p>
          Bitmap mémoire: <b>{hasBitmap ? 'Présent' : 'Absent'}</b>
        </p>
      </div>
    </section>
  )
}
