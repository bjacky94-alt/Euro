import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DecodedCombination } from '../utils/resultGenerator'

interface ResultGeneratorProps {
  requestedCount: number
  onRequestedCountChange: (value: number) => void
  onGenerate: () => void
  visibleResults: DecodedCombination[]
  warning: string
  disabled: boolean
}

export function ResultGenerator({
  requestedCount,
  onRequestedCountChange,
  onGenerate,
  visibleResults,
  warning,
  disabled,
}: ResultGeneratorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])
  const hasResults = visibleResults.length > 0

  useEffect(() => {
    if (!hasResults) {
      setSelectedIndex(-1)
      return
    }

    if (selectedIndex >= visibleResults.length) {
      setSelectedIndex(visibleResults.length - 1)
    }
  }, [hasResults, selectedIndex, visibleResults.length])

  useEffect(() => {
    if (selectedIndex < 0) {
      return
    }
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasResults) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev < 0 ? 0 : Math.min(visibleResults.length - 1, prev + 1)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev < 0 ? 0 : Math.max(0, prev - 1)))
      return
    }

    if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault()
      setSelectedIndex((prev) => prev)
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Mes combinaisons</h2>
      </header>

      <div className="generator-controls">
        <label htmlFor="target-count">Nombre</label>
        <div className="generator-actions">
          <input
            id="target-count"
            type="number"
            min={1}
            value={requestedCount}
            onChange={(event) => onRequestedCountChange(Number(event.target.value))}
          />
          <button type="button" onClick={onGenerate} disabled={disabled}>
            Générer
          </button>
        </div>
      </div>

      {warning ? <p className="warning-inline">{warning}</p> : null}

      <div
        className="result-table-wrap result-list"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Liste des combinaisons générées"
      >
        {visibleResults.length === 0 ? (
          <p className="empty-results">Aucune combinaison générée.</p>
        ) : (
          visibleResults.map((row, index) => {
            const selected = index === selectedIndex
            return (
              <button
                key={row.index}
                type="button"
                className={`result-row ${selected ? 'selected-row' : ''}`}
                onClick={() => setSelectedIndex(index)}
                aria-selected={selected}
                ref={(element) => {
                  rowRefs.current[index] = element
                }}
              >
                <span className="row-rank">{index + 1}.</span>

                <span className="row-balls">
                  {row.numbers.map((n) => (
                    <span key={`${row.index}-n-${n}`} className="ball number-ball">
                      {n}
                    </span>
                  ))}
                </span>

                <span className="row-plus">+</span>

                <span className="row-balls">
                  {row.stars.map((s) => (
                    <span key={`${row.index}-s-${s}`} className="ball star-ball">
                      {s}
                    </span>
                  ))}
                </span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
