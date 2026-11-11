import { useState } from 'react'
import { CATALOG, CatalogExercise, SELECTABLE_MUSCLES, canonicalKey, find, isKnown, key, muscleIndex, muscleTitle } from '../analytics/catalog'
import { useStore } from '../data/store'
import { Modal, MuscleLine, SheetHeader } from './common'

/** Only catalog or user exercises (with mandatory primary muscle) can be picked — same rules as the app. */
export function ExercisePicker({ title = 'Выбор упражнения', initialQuery = '', planned = [], onPick, onClose }: {
  title?: string; initialQuery?: string; planned?: string[]; onPick: (name: string) => void; onClose: () => void
}) {
  const store = useStore()
  const [query, setQuery] = useState(initialQuery.trim())
  const [filter, setFilter] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const q = key(query)
  const customEntries: CatalogExercise[] = Object.values(store.custom).map(c => ({ ...c, pair: false, aliases: [], repsMin: 8, repsMax: 12, stepGrams: 2500, custom: true }))
  const all = [...CATALOG, ...customEntries].filter((e, i, a) => a.findIndex(x => key(x.name) === key(e.name)) === i)
  const matches = (e: CatalogExercise) => !q || key(e.name).includes(q) || e.aliases.some(a => key(a).includes(q))
  const filtered = all.filter(e => matches(e) && (!filter || e.primary === filter || e.secondary.includes(filter)))
  const exact = find(query) ?? store.custom[q]
  const groups = new Map<string, CatalogExercise[]>()
  for (const e of filtered) groups.set(e.primary, [...(groups.get(e.primary) ?? []), e])
  const recent = [...new Set([...store.db.sets].reverse().map(s => s.exercise))].slice(0, 8)

  if (creating) return <CreateExercise initialName={query} onClose={() => setCreating(false)} onSaved={name => onPick(name)} />

  const row = (e: CatalogExercise, label: string, k: string) => (
    <div key={k} className="list-item" style={{ opacity: isKnown(e) ? 1 : 0.6 }} onClick={() => isKnown(e) && onPick(isKnown(e) && !e.custom ? e.name : label)}>
      <div className="between"><b style={{ fontWeight: 600 }}>{e.name}</b>{e.custom && isKnown(e) && <span className="pill">своё</span>}</div>
      <MuscleLine ex={e} />
    </div>
  )
  const plannedList = planned.filter((p, i, a) => a.findIndex(x => canonicalKey(x) === canonicalKey(p)) === i)
  const recentOnly = recent.filter(r => !plannedList.some(p => canonicalKey(p) === canonicalKey(r)))

  return (
    <Modal onClose={onClose}>
      <SheetHeader title={title} onClose={onClose} />
      <input autoFocus placeholder="Поиск: жим, тяга, бицепс…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="chips" style={{ marginTop: 8 }}>
        <button className={'chip' + (!filter ? ' on' : '')} onClick={() => setFilter(null)}>Все</button>
        {SELECTABLE_MUSCLES.map(m => <button key={m.id} className={'chip' + (filter === m.id ? ' on' : '')} onClick={() => setFilter(filter === m.id ? null : m.id)}>{m.title}</button>)}
      </div>
      {q && !exact && (
        <div className="list-item" style={{ background: 'var(--orange-dim)', borderColor: 'rgba(255,138,61,.35)' }} onClick={() => setCreating(true)}>
          <b>＋ Создать «{query.trim()}»</b><div className="muted small">Нужно будет указать, какие мышцы оно качает</div>
        </div>
      )}
      {!q && !filter && plannedList.length > 0 && <><h3 style={{ color: 'var(--orange)', marginTop: 10 }}>По плану</h3>{plannedList.map(p => row(store.resolve(p), p, 'p' + p))}</>}
      {!q && !filter && recentOnly.length > 0 && <><h3 style={{ color: 'var(--orange)', marginTop: 10 }}>Недавние</h3>{recentOnly.map(p => row(store.resolve(p), p, 'r' + p))}</>}
      {filter ? <>
        {/* The chosen muscle first: exercises that target it, then the ones where it only helps (rows → biceps). */}
        {(() => {
          const main = filtered.filter(e => e.primary === filter), helps = filtered.filter(e => e.primary !== filter)
          return <>
            {main.length > 0 && <div><h3 style={{ color: 'var(--orange)', marginTop: 10 }}>{muscleTitle(filter)}</h3>{main.map(e => row(e, e.name, 'c' + e.name))}</div>}
            {helps.length > 0 && <div><h3 className="muted" style={{ marginTop: 14 }}>Тоже нагружают: {muscleTitle(filter).toLowerCase()}</h3>{helps.map(e => row(e, e.name, 'h' + e.name))}</div>}
          </>
        })()}
      </> : [...groups.entries()].sort((a, b) => muscleIndex(a[0]) - muscleIndex(b[0])).map(([m, list]) => (
        <div key={m}><h3 style={{ color: 'var(--orange)', marginTop: 10 }}>{muscleTitle(m)}</h3>{list.map(e => row(e, e.name, 'c' + e.name))}</div>
      ))}
      {!filtered.length && q && <p className="muted">В справочнике не нашлось. Создай своё упражнение кнопкой выше.</p>}
    </Modal>
  )
}

export function CreateExercise({ initialName, onClose, onSaved, fixedName, initialPrimary = null, initialSecondary = [] }: {
  initialName: string; onClose: () => void; onSaved: (name: string) => void; fixedName?: boolean; initialPrimary?: string | null; initialSecondary?: string[]
}) {
  const store = useStore()
  const [name, setName] = useState(initialName.trim())
  const [primary, setPrimary] = useState<string | null>(initialPrimary)
  const [secondary, setSecondary] = useState<string[]>(initialSecondary)
  const inCatalog = find(name)
  const grid = (selected: string[], onToggle: (m: string) => void, disabled: string[] = []) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
      {SELECTABLE_MUSCLES.map(m => {
        const on = selected.includes(m.id), off = disabled.includes(m.id)
        return <button key={m.id} disabled={off} onClick={() => onToggle(m.id)} style={{ padding: '10px 4px', borderRadius: 12, fontSize: 13, background: on ? 'var(--orange)' : off ? 'transparent' : 'var(--s2)', color: on ? '#000' : off ? 'var(--muted)' : 'var(--text)' }}>{m.title}</button>
      })}
    </div>
  )
  return (
    <Modal onClose={onClose}>
      <SheetHeader title={fixedName ? 'Своё упражнение' : 'Новое упражнение'} onClose={onClose} />
      <label>Название</label>
      <input value={name} disabled={fixedName} onChange={e => setName(e.target.value)} />
      {inCatalog && <p style={{ color: 'var(--orange)' }}>Такое уже есть в справочнике: «{inCatalog.name}»</p>}
      <h3 style={{ marginTop: 14 }}>Что качает в первую очередь? *</h3>
      <p className="muted small">Целевая мышца: каждый подход засчитывается ей как 1 подход.</p>
      {grid(primary ? [primary] : [], m => { setPrimary(m); setSecondary(s => s.filter(x => x !== m)) })}
      <h3>Какие мышцы помогают? (необязательно)</h3>
      <p className="muted small">Вспомогательные мышцы получают ½ подхода. Например, в тягах помогает бицепс.</p>
      {grid(secondary, m => setSecondary(s => (s.includes(m) ? s.filter(x => x !== m) : [...s, m])), primary ? [primary] : [])}
      <button className="btn block" disabled={!name.trim() || !primary || !!inCatalog} onClick={async () => { await store.saveCustom(name, primary!, secondary); onSaved(name.trim()) }}>
        {primary ? 'Сохранить и выбрать' : 'Выбери целевую мышцу'}
      </button>
    </Modal>
  )
}
