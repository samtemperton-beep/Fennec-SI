'use client'
import { IconArrowUp, IconArrowDown, IconEye, IconEyeOff } from '@tabler/icons-react'
import { CARD_INFO, DEFAULT_LAYOUT, type LayoutItem } from './layout'

export function LayoutEditor({ layout, onChange, onDone }: {
  layout: LayoutItem[]
  onChange: (next: LayoutItem[]) => void
  onDone: () => void
}) {
  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= layout.length) return
    const next = [...layout]
    ;[next[index], next[to]] = [next[to], next[index]]
    onChange(next)
  }
  function toggle(index: number) {
    onChange(layout.map((item, i) => (i === index ? { ...item, hidden: !item.hidden } : item)))
  }

  return (
    <section className="dl-panel" aria-label="Customise dashboard">
      <div className="dl-head">
        <div>
          <h2 className="dl-title">Customise your dashboard</h2>
          <p className="dl-sub">Show, hide and reorder cards. Changes save as you go.</p>
        </div>
        <button className="dl-done" onClick={onDone}>Done</button>
      </div>
      <ol className="dl-list">
        {layout.map((item, i) => {
          const info = CARD_INFO[item.id]
          return (
            <li key={item.id} className={`dl-row ${item.hidden ? 'hidden' : ''}`}>
              <div className="dl-moves">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${info.label} up`}><IconArrowUp size={15} /></button>
                <button onClick={() => move(i, 1)} disabled={i === layout.length - 1} aria-label={`Move ${info.label} down`}><IconArrowDown size={15} /></button>
              </div>
              <div className="dl-text">
                <span className="dl-name">{info.label}</span>
                <span className="dl-desc">{info.description}</span>
              </div>
              <button
                className={`dl-toggle ${item.hidden ? '' : 'on'}`}
                onClick={() => toggle(i)}
                role="switch"
                aria-checked={!item.hidden}
                aria-label={`${item.hidden ? 'Show' : 'Hide'} ${info.label}`}
              >
                {item.hidden ? <><IconEyeOff size={14} /> Hidden</> : <><IconEye size={14} /> Shown</>}
              </button>
            </li>
          )
        })}
      </ol>
      <button className="dl-reset" onClick={() => onChange(DEFAULT_LAYOUT)}>Reset to default</button>
    </section>
  )
}
