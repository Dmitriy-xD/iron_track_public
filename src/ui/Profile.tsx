import { useEffect, useState } from 'react'
import { Locked, PlanCard } from '../access'
import { tg } from '../tg'
import { localDay, today as todayDay, formatDay } from '../analytics/dates'
import { formatKg, parseKgToGrams, fmt1 } from '../analytics/metrics'
import { buildReport } from '../analytics/report'
import { Client, Trainer, auth, trainer } from '../data/api'
import { useStore } from '../data/store'
import { Profile as P, planExercises } from '../data/types'
import { Modal, MuscleLine, Seg, SheetHeader } from './common'
import { key } from '../analytics/catalog'
import { CreateExercise } from './ExercisePicker'
import { LegalLinks, SupportCard } from './Support'
import { ask } from './motion'
import { ThemePref, useTheme } from '../theme'

declare const __APP_VERSION__: string
type Period = 'week' | 'month' | 'quarter' | 'all'

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function Profile({ toast, onSignOut }: { toast: (m: string) => void; onSignOut: () => void }) {
  const store = useStore()
  const { db } = store
  const [period, setPeriod] = useState<Period>('week')
  const [editing, setEditing] = useState(false)
  const [measure, setMeasure] = useState(false)
  const [customEdit, setCustomEdit] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const t = todayDay()
  const from = period === 'week' ? t - 6 : period === 'month' ? t - 29 : period === 'quarter' ? t - 89 : Math.min(t, ...db.sessions.map(s => localDay(s.startedAt)))
  const report = buildReport({
    title: `отчёт: ${{ week: 'неделя', month: 'месяц', quarter: '3 месяца', all: 'всё время' }[period]}`,
    from, to: t, today: t, dayOf: localDay, athleteName: db.profile.name, sets: store.logged,
    sessions: db.sessions.map(s => [s.startedAt, s.finishedAt]), bodyweights: db.measurements.filter(m => m.weightGrams != null).map(m => [m.epochDay, m.weightGrams!]),
    plannedDays: new Set(db.plan.map(p => p.dayOfWeek)), resolve: store.resolve
  })
  const p = db.profile
  const age = p.birthYear ? new Date().getFullYear() - p.birthYear : null
  const lastWeight = [...db.measurements].reverse().find(m => m.weightGrams != null)?.weightGrams

  return (
    <>
      <h1>Профиль</h1>
      <ThemeCard />
      {!store.acting && <>
      <PlanCard />
      {!tg && <div className="card">
        <h2>Аккаунт</h2>
        <b>{store.email}</b>
        <p className="muted small">Тренировки хранятся на сервере и синхронизируются с приложением на телефоне.</p>
        <div className="row">
          <button className="btn ghost" onClick={async () => { await auth.signOut(); onSignOut() }}>Выйти</button>
          <button className="link danger" onClick={() => setDeleting(true)}>Удалить аккаунт</button>
        </div>
      </div>}
      <MyTrainers toast={toast} />
      <Locked need="trainer" feature="Режим тренера"><TrainerSection toast={toast} /></Locked>
      </>}
      <div className="card">
        {!editing ? <>
          <div className="between"><div><h2 style={{ fontSize: 22 }}>{p.name || store.acting?.name || 'Без имени'}</h2>
            <div className="muted">{[age && `${age} лет`, p.heightCm && `${p.heightCm} см`, lastWeight && `${formatKg(lastWeight)} кг`, p.experienceYears != null && `стаж ${p.experienceYears} г.`].filter(Boolean).join(' • ') || 'Заполни данные о себе'}</div></div>
            <button className="link" onClick={() => setEditing(true)}>Изменить</button></div>
          {p.goal && <><div style={{ color: 'var(--orange)', marginTop: 8 }}>Цель</div><div>{p.goal}</div></>}
          {p.notes && <><div style={{ color: 'var(--orange)', marginTop: 8 }}>Заметки</div><div className="muted">{p.notes}</div></>}
        </> : <ProfileForm p={p} onDone={() => setEditing(false)} />}
      </div>
      <div className="card">
        <div className="between"><h2>Замеры тела</h2><button className="link" onClick={() => setMeasure(true)}>+ Добавить</button></div>
        {!db.measurements.length && <p className="muted">Добавляй вес и обхваты раз в 1–2 недели, чтобы видеть динамику.</p>}
        {[...db.measurements].reverse().slice(0, 10).map(m => (
          <div key={m.id} className="between" style={{ padding: '6px 0' }}>
            <div><b>{formatDay(m.epochDay)}</b><div className="muted small">{[m.weightGrams != null && `вес ${formatKg(m.weightGrams)} кг`, m.bodyFatPct != null && `жир ${fmt1(m.bodyFatPct)}%`, m.waistCm != null && `талия ${fmt1(m.waistCm)}`, m.chestCm != null && `грудь ${fmt1(m.chestCm)}`, m.armCm != null && `бицепс ${fmt1(m.armCm)}`].filter(Boolean).join(' • ')}</div></div>
            <button className="muted" onClick={() => store.deleteMeasurement(m.id)}>✕</button>
          </div>
        ))}
      </div>
      <Locked feature="Отчёты"><div className="card">
        <h2>Отчёты</h2>
        <Seg options={[['week', 'Неделя'], ['month', 'Месяц'], ['quarter', '3 месяца'], ['all', 'Всё время']]} value={period} onChange={setPeriod} />
        <pre className="report">{report}</pre>
        <div className="row">
          <button className="btn" onClick={async () => {
            if (navigator.share) { try { await navigator.share({ title: 'IRONTRACK — отчёт', text: report }) } catch { /* cancelled */ } }
            else { await navigator.clipboard.writeText(report); toast('Отчёт скопирован') }
          }}>Поделиться</button>
          <button className="btn ghost" onClick={() => download(`irontrack-report-${new Date().toISOString().slice(0, 10)}.txt`, report, 'text/plain')}>Скачать .txt</button>
        </div>
      </div></Locked>
      <div className="card">
        <h2>Мои упражнения</h2>
        {!db.customRows.some(r => !r.admin) && <p className="muted">Своих упражнений пока нет. Их можно создать при выборе упражнения — с обязательным указанием мышц.</p>}
        {Object.entries(store.custom).filter(([k]) => !db.customRows.find(r => key(r.name) === k)?.admin).map(([k, c]) => (
          <div key={k} className="between" style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => setCustomEdit(k)}>
            <div><div>{c.name}</div><MuscleLine ex={{ ...c, pair: false, aliases: [], repsMin: 8, repsMax: 12, stepGrams: 2500, custom: true }} /></div><span className="muted">✎</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Данные</h2>
        <p className="muted small">Резервная копия совместима с приложением на телефоне (Профиль → Данные).</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => download(`irontrack-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup(), 'application/json')}>Скачать резервную копию</button>
          <label className="btn ghost" style={{ margin: 0, color: 'var(--orange)', fontSize: 15 }}>
            Загрузить из копии
            <input type="file" accept=".json,application/json" hidden onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return
              try { toast(await store.importBackup(await f.text())) } catch (err) { toast('Ошибка: ' + (err as Error).message) }
              e.target.value = ''
            }} />
          </label>
          <button className="btn ghost" disabled={!db.sets.length} onClick={() => download(`irontrack-${new Date().toISOString().slice(0, 10)}.csv`, csv(store), 'text/csv')}>CSV для Excel</button>
        </div>
        <p className="muted small">Тренировок: {db.sessions.length} • подходов: {db.sets.length} • замеров: {db.measurements.length} • дней в плане: {db.plan.length} ({db.plan.reduce((a, x) => a + planExercises(x).length, 0)} упражнений)</p>
      </div>
      {!store.acting && <><SupportCard signedIn toast={toast} /><LegalLinks /></>}
      <p className="muted small">IRONTRACK web {__APP_VERSION__}</p>
      {deleting && <DeleteAccount onClose={() => setDeleting(false)} onDeleted={onSignOut} />}
      {measure && <MeasurementForm lastWeight={lastWeight ?? null} onClose={() => setMeasure(false)} />}
      {customEdit && store.custom[customEdit] && (
        <CreateExercise initialName={store.custom[customEdit].name} fixedName initialPrimary={store.custom[customEdit].primary} initialSecondary={store.custom[customEdit].secondary}
          onClose={() => setCustomEdit(null)} onSaved={() => setCustomEdit(null)} />
      )}
    </>
  )
}

function csv(store: ReturnType<typeof useStore>): string {
  const started = new Map(store.db.sessions.map(s => [s.id, s.startedAt]))
  const esc = (v: string) => {
    const safe = v && '=+-@\t\r'.includes(v[0]) && isNaN(Number(v)) ? "'" + v : v
    return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
  }
  const rows = store.db.sets.map(s => [s.sessionId, started.has(s.sessionId) ? new Date(started.get(s.sessionId)!).toISOString() : '', s.exercise, formatKg(s.weightGrams), String(s.reps), String(s.implements), s.rir == null ? '' : String(s.rir), s.kind, new Date(s.createdAt).toISOString()].map(esc).join(','))
  return ['session_id,session_started_at,exercise,weight_kg,reps,implements,rir,kind,created_at', ...rows].join('\n') + '\n'
}

function ProfileForm({ p, onDone }: { p: P; onDone: () => void }) {
  const store = useStore()
  const [f, setF] = useState({ name: p.name, birthYear: p.birthYear?.toString() ?? '', heightCm: p.heightCm?.toString() ?? '', exp: p.experienceYears?.toString() ?? '', sex: p.sex, goal: p.goal, notes: p.notes })
  const num = (v: string, lo: number, hi: number) => { const n = Number(v); return v.trim() && Number.isInteger(n) && n >= lo && n <= hi ? n : null }
  return (
    <>
      <label>Имя</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 6 }}>
        <div><label>Год рождения</label><input inputMode="numeric" value={f.birthYear} onChange={e => setF({ ...f, birthYear: e.target.value })} /></div>
        <div><label>Рост, см</label><input inputMode="numeric" value={f.heightCm} onChange={e => setF({ ...f, heightCm: e.target.value })} /></div>
        <div><label>Стаж, лет</label><input inputMode="numeric" value={f.exp} onChange={e => setF({ ...f, exp: e.target.value })} /></div>
      </div>
      <Seg options={[['m', 'Мужской'], ['f', 'Женский']]} value={f.sex ?? ''} onChange={v => setF({ ...f, sex: v })} />
      <label>Цель</label><input value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })} placeholder="жим 100 кг, гипертрофия" />
      <label>Заметки (ограничения, травмы — видишь только ты)</label><textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={async () => {
          await store.saveProfile({ ...p, name: f.name.trim(), birthYear: num(f.birthYear, 1900, new Date().getFullYear()), heightCm: num(f.heightCm, 50, 260), experienceYears: num(f.exp, 0, 80), sex: f.sex, goal: f.goal.trim(), notes: f.notes.trim() })
          onDone()
        }}>Сохранить</button>
        <button className="btn ghost" onClick={onDone}>Отмена</button>
      </div>
    </>
  )
}

function MeasurementForm({ lastWeight, onClose }: { lastWeight: number | null; onClose: () => void }) {
  const store = useStore()
  const iso = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ date: iso, weight: lastWeight != null ? formatKg(lastWeight) : '', fat: '', waist: '', chest: '', arm: '' })
  const [error, setError] = useState<string | null>(null)
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null)
  const save = async () => {
    const [y, m, d] = f.date.split('-').map(Number)
    if (!y || !m || !d) return setError('Укажи дату')
    const grams = f.weight.trim() ? parseKgToGrams(f.weight) : null
    if (f.weight.trim() && (grams == null || grams < 20000 || grams > 400000)) return setError('Вес: 20–400 кг')
    const vals = [f.fat, f.waist, f.chest, f.arm].map(num)
    if (vals.some(v => v != null && (!(v > 0) || v > 300))) return setError('Проверь обхваты и % жира')
    if (grams == null && vals.every(v => v == null)) return setError('Заполни хотя бы одно поле')
    await store.saveMeasurement({ id: crypto.randomUUID(), epochDay: Math.floor(Date.UTC(y, m - 1, d) / 86400000), weightGrams: grams, bodyFatPct: vals[0], waistCm: vals[1], chestCm: vals[2], armCm: vals[3] })
    onClose()
  }
  const field = (k: keyof typeof f, l: string) => <div><label>{l}</label><input inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>
  return (
    <Modal onClose={onClose}>
      <SheetHeader title="Новый замер" onClose={onClose} />
      <label>Дата</label><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
      <div className="grid2" style={{ marginTop: 6 }}>{field('weight', 'Вес, кг')}{field('fat', 'Жир, %')}{field('waist', 'Талия, см')}{field('chest', 'Грудь, см')}{field('arm', 'Бицепс, см')}</div>
      {error && <p className="danger">{error}</p>}
      <button className="btn block" onClick={save}>Сохранить</button>
    </Modal>
  )
}

/** Trainer mode: notebooks of clients. Add by name, open and log their workouts; give a code to link their own account. */
function TrainerSection({ toast }: { toast: (m: string) => void }) {
  const store = useStore()
  const on = store.user.is_trainer
  const [clients, setClients] = useState<Client[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<{ name: string; code: string; days: number } | null>(null)
  const load = () => { if (on) trainer.clients().then(setClients).catch(e => toast((e as Error).message)) }
  useEffect(load, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async () => {
    try { store.setUser(await trainer.setTrainer(!on)) } catch (e) { toast((e as Error).message) }
  }
  const add = async () => {
    setBusy(true)
    try {
      const id = await trainer.create(name.trim())
      toast(`Подопечный «${name.trim()}» добавлен`)
      setName(''); load()
      store.openNotebook({ id, name: name.trim() })
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="card">
      <div className="between">
        <div><h2 style={{ margin: 0 }}>Я тренер</h2><div className="muted small">Веди тренировки своих подопечных, как в блокноте</div></div>
        <button className={'switch' + (on ? ' on' : '')} onClick={toggle} aria-label="Режим тренера"><span /></button>
      </div>
      {on && <>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="grow" placeholder="Имя подопечного" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && add()} />
          <button className="btn" disabled={busy || !name.trim()} onClick={add}>Добавить</button>
        </div>
        {!clients.length && <p className="muted">Добавь первого подопечного — потом открывай его и записывай тренировки как обычно.</p>}
        {clients.map(c => (
          <div key={c.id} className="list-item">
            <div className="between">
              <div style={{ minWidth: 0 }}>
                <b>{c.name || c.email}</b>
                <div className="muted small">{c.own_account ? `свой аккаунт • ${c.email}` : 'блокнот'} • {c.workouts} трен.{c.last_workout_at ? ` • последняя ${new Date(c.last_workout_at).toLocaleDateString('ru')}` : ''}</div>
              </div>
              <button className="btn" onClick={() => store.openNotebook({ id: c.id, name: c.name || c.email })}>Открыть</button>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              {!c.own_account && <button className="link small" onClick={async () => {
                try { setCode({ name: c.name, ...(await trainer.code(c.id)) }) } catch (e) { toast((e as Error).message) }
              }}>Код для привязки аккаунта</button>}
              <div className="grow" />
              <button className="link small danger" onClick={async () => {
                const msg = c.own_account ? `Перестать вести ${c.name || c.email}? Его аккаунт и тренировки останутся у него.` : `Удалить блокнот «${c.name}» со всеми тренировками?`
                if (await ask(msg, { ok: 'Да', danger: true })) { await trainer.remove(c.id); load() }
              }}>{c.own_account ? 'Отвязать' : 'Удалить'}</button>
            </div>
          </div>
        ))}
      </>}
      {code && (
        <Modal onClose={() => setCode(null)}>
          <SheetHeader title="Код для привязки" onClose={() => setCode(null)} />
          <p className="muted">Если {code.name} захочет свой аккаунт: пусть зарегистрируется на сайте и введёт этот код в профиле, в блоке «Мой тренер». Все тренировки из блокнота перейдут к нему, а ты сможешь и дальше их вести.</p>
          <div className="code-box">{code.code}</div>
          <p className="muted small">Код действует {code.days} дней и срабатывает один раз.</p>
          <button className="btn block" onClick={async () => { try { await navigator.clipboard.writeText(code.code); toast('Код скопирован') } catch { /* clipboard blocked */ } }}>Скопировать</button>
        </Modal>
      )}
    </div>
  )
}

/** As a person: trainers who keep my workouts, and a code from a trainer to attach their notebook to my account. */
function MyTrainers({ toast }: { toast: (m: string) => void }) {
  const store = useStore()
  const [list, setList] = useState<Trainer[]>([])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => { trainer.trainers().then(setList).catch(() => setList([])) }
  useEffect(load, [])
  const redeem = async () => {
    setBusy(true)
    try { toast(await trainer.redeem(code)); setCode(''); load(); store.reload() } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="card">
      <h2>Мой тренер</h2>
      {list.map(t => (
        <div key={t.id} className="between" style={{ padding: '6px 0' }}>
          <div><b>{t.name || t.email}</b><div className="muted small">ведёт твои тренировки</div></div>
          <button className="link danger" onClick={async () => { if (await ask('Отвязать тренера?', { text: 'Тренер больше не сможет видеть и вести твои тренировки.', ok: 'Отвязать', danger: true })) { await trainer.leave(t.id); toast('Тренер отвязан'); load() } }}>Отвязать</button>
        </div>
      ))}
      {!list.length && <p className="muted small">Тренер вёл тебя в своём блокноте? Попроси у него код — тренировки перейдут в твой аккаунт.</p>}
      <div className="row">
        <input className="grow" placeholder="Код от тренера, например ABCD-EF23" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 8} onClick={redeem}>Привязать</button>
      </div>
    </div>
  )
}

function DeleteAccount({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal onClose={onClose}>
      <SheetHeader title="Удалить аккаунт" onClose={onClose} />
      <p>Аккаунт и все тренировки, замеры и план будут удалены с сервера без возможности восстановления. Это также отзыв согласия на обработку персональных данных.</p>
      <p className="muted small">Перед удалением можно скачать резервную копию в разделе «Данные».</p>
      <label>Пароль для подтверждения</label>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p className="danger">{error}</p>}
      <button className="btn block danger-btn" style={{ marginTop: 12 }} disabled={!password} onClick={async () => {
        try { await auth.deleteAccount(password); onDeleted() } catch (e) { setError((e as Error).message) }
      }}>Удалить навсегда</button>
    </Modal>
  )
}

function ThemeCard() {
  const [pref, setPref] = useTheme()
  return (
    <div className="card">
      <h2>Оформление</h2>
      <Seg options={[['system', 'Как в Telegram'], ['light', 'Светлая'], ['dark', 'Тёмная']] as [ThemePref, string][]} value={pref} onChange={setPref} />
    </div>
  )
}
