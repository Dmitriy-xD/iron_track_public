import { useEffect, useMemo, useState } from 'react'
import { tg } from '../tg'
import { Funnel } from './Funnel'
import { MUSCLES, muscleTitle } from '../analytics/catalog'
import { formatDateTime } from '../analytics/dates'
import { AdminExercise, AdminUser, Dataset, Row, SupportMessage, admin } from '../data/api'
import { Kpi, Modal, Seg, SheetHeader } from './common'
import { SessionTimeEditor, UserDataView } from './People'
import { ask } from './motion'

type Tab = 'funnel' | 'users' | 'exercises' | 'support'
const when = (ms: number | null) => (ms ? formatDateTime(ms) : '—')

export function Admin({ toast }: { toast: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>(tg ? 'funnel' : 'users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [exercises, setExercises] = useState<AdminExercise[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [editEx, setEditEx] = useState<Partial<AdminExercise> | null>(null)

  const load = async () => {
    try {
      const [u, e, m] = await Promise.all([admin.users(), admin.exercises(), admin.support()])
      setUsers(u); setExercises(e); setMessages(m); setError(null)
    } catch (err) { setError((err as Error).message) }
  }
  useEffect(() => { load() }, [])

  const active7 = users.filter(u => u.last_workout_at && u.last_workout_at > Date.now() - 7 * 86_400_000).length
  return (
    <>
      <h1>Админка</h1>
      {error && <div className="warn"><b>Ошибка</b><div className="muted small">{error}</div></div>}
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Kpi label="Пользователей" value={String(users.length)} />
        <Kpi label="Тренировались за 7 дней" value={String(active7)} />
        <Kpi label="Обращений" value={String(messages.length)} />
      </div>
      <Seg options={[['funnel', 'Воронка'], ['users', 'Люди'], ['exercises', 'Упражнения'], ['support', 'Поддержка']]} value={tab} onChange={setTab} />
      {tab === 'funnel' && <Funnel />}
      {tab === 'users' && <Users users={users} onOpen={setOpenUser} />}
      {tab === 'exercises' && <>
        <button className="btn block" style={{ marginBottom: 12 }} onClick={() => setEditEx({ public: true, secondary: [], users: [] })}>+ Новое упражнение</button>
        {!exercises.length && <p className="muted">Своих упражнений пока нет. Добавленные здесь появятся у людей в справочнике — у всех или только у выбранных.</p>}
        {exercises.map(e => (
          <div key={e.id} className="list-item" onClick={() => setEditEx(e)}>
            <div className="between"><b>{e.title}</b><span className="pill">{e.public ? 'всем' : `${e.users.length} чел.`}</span></div>
            <div className="muted small">{muscleTitle(e.muscle)}{e.secondary.length ? ' + ' + e.secondary.map(m => muscleTitle(m).toLowerCase()).join(', ') : ''}{!e.public && ' • ' + e.users.map(u => u.email).join(', ')}</div>
          </div>
        ))}
      </>}
      {tab === 'support' && <>
        {!messages.length && <p className="muted">Обращений пока нет.</p>}
        {messages.map(m => (
          <div key={m.id} className="card">
            <div className="between"><b>{m.email ?? m.contact ?? 'аноним'}</b><span className="muted small">{when(m.created_at)}</span></div>
            {m.email && m.contact && m.contact !== m.email && <div className="muted small">{m.contact}</div>}
            <p style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>{m.text}</p>
            <span className={'pill' + (m.delivered ? ' good' : '')}>{m.delivered ? 'письмо отправлено' : 'только здесь'}</span>
          </div>
        ))}
      </>}
      {openUser && <UserCard id={openUser} toast={toast} onClose={() => setOpenUser(null)}
        onGive={u => { setOpenUser(null); setTab('exercises'); setEditEx({ public: false, secondary: [], users: [{ id: u.id, email: u.email }] }) }} />}
      {editEx && <ExerciseForm ex={editEx} users={users} toast={toast} onClose={() => setEditEx(null)} onSaved={() => { setEditEx(null); load() }} />}
    </>
  )
}

function Users({ users, onOpen }: { users: AdminUser[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('')
  const list = users.filter(u => (u.email + ' ' + u.name).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <input placeholder="Поиск по почте или имени" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {list.map(u => (
        <div key={u.id} className="list-item" onClick={() => onOpen(u.id)}>
          <div className="between">
            <div style={{ minWidth: 0 }}><b>{u.name || u.email}</b><div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.notebook_of ? `ведёт ${u.notebook_of}` : u.email}</div></div>
            <div className="row">
              {u.is_admin && <span className="pill">админ</span>}
              {u.is_trainer && <span className="pill">тренер</span>}
              {u.notebook_of && <span className="pill">блокнот тренера</span>}
              {!u.confirmed && !u.notebook_of && <span className="pill bad">не подтвердил почту</span>}
            </div>
          </div>
          <div className="muted small">{u.workouts} трен. • {u.sets} подх. • последняя: {when(u.last_workout_at)} • с нами с {new Date(u.created_at).toLocaleDateString('ru')}</div>
        </div>
      ))}
    </>
  )
}

function UserCard({ id, toast, onClose, onGive }: { id: string; toast: (m: string) => void; onClose: () => void; onGive: (u: AdminUser) => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof admin.user>> | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const load = () => admin.user(id).then(setInfo).catch(e => toast((e as Error).message))
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const u = info?.user
  return (
    <Modal onClose={onClose}>
      <SheetHeader title={u ? (info?.data.profile?.name || u.name || u.email) : 'Загрузка…'} onClose={onClose} />
      {u && info && <>
        <div className="card">
          <div><b>{u.email}</b></div>
          <div className="muted small">Регистрация: {when(u.created_at)} • почта {u.confirmed ? 'подтверждена' : 'не подтверждена'} • последний вход: {when(u.last_seen_at)}</div>
          <div className="muted small">Согласие на обработку ПД: {when(u.consent_at)} (редакция {u.consent_version || '—'}, IP {u.consent_ip || '—'})</div>
          {info.trainers.length > 0 && <div className="small" style={{ marginTop: 6 }}>Тренеры: {info.trainers.map(t => `${t.email} (${t.status === 'active' ? 'активен' : 'ждёт'})`).join(', ')}</div>}
          {info.clients.length > 0 && <div className="small">Подопечные: {info.clients.map(t => `${t.email} (${t.status === 'active' ? 'активен' : 'ждёт'})`).join(', ')}</div>}
          <button className="link" onClick={() => onGive(u)}>Выдать упражнение этому человеку</button>
        </div>
        <UserDataView data={info.data as Dataset} onEditSession={setEditing} />
      </>}
      {editing && (
        <SessionTimeEditor startedAt={editing.started_at} finishedAt={editing.finished_at}
          suggestEnd={lastSetEnd(info?.data.sets ?? [], editing)}
          onSave={async (s, e) => { await admin.editSession(id, editing.id, s, e); toast('Время тренировки исправлено'); load() }}
          onClose={() => setEditing(null)} />
      )}
    </Modal>
  )
}

function lastSetEnd(sets: Row[], session: Row): number | null {
  const last = Math.max(0, ...sets.filter(s => s.session_id === session.id).map(s => Number(s.created_at)))
  return last > session.started_at ? last + 5 * 60_000 : null
}

function ExerciseForm({ ex, users, toast, onClose, onSaved }: {
  ex: Partial<AdminExercise>; users: AdminUser[]; toast: (m: string) => void; onClose: () => void; onSaved: () => void
}) {
  const [title, setTitle] = useState(ex.title ?? '')
  const [muscle, setMuscle] = useState(ex.muscle ?? '')
  const [secondary, setSecondary] = useState<string[]>(ex.secondary ?? [])
  const [isPublic, setPublic] = useState(ex.public ?? true)
  const [picked, setPicked] = useState<{ id: string; email: string }[]>(ex.users ?? [])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const muscles = MUSCLES
  const found = useMemo(() => q.trim().length < 2 ? [] : users.filter(u => (u.email + u.name).toLowerCase().includes(q.trim().toLowerCase()) && !picked.some(p => p.id === u.id)).slice(0, 6), [q, users, picked])
  const save = async () => {
    setBusy(true)
    try {
      await admin.saveExercise({ id: ex.id, title: title.trim(), muscle, secondary, public: isPublic, user_ids: picked.map(p => Number(p.id)) })
      toast('Упражнение сохранено'); onSaved()
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal onClose={onClose}>
      <SheetHeader title={ex.id ? 'Упражнение' : 'Новое упражнение'} onClose={onClose} />
      <label>Название</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Подъём штанги на бицепс стоя" />
      <label style={{ marginTop: 10 }}>Что качает (главная мышца)</label>
      <div className="chips wrap">{muscles.map(m => <button key={m.id} className={'chip' + (muscle === m.id ? ' on' : '')} onClick={() => { setMuscle(m.id); setSecondary(s => s.filter(x => x !== m.id)) }}>{m.title}</button>)}</div>
      <label>Помогают (необязательно)</label>
      <div className="chips wrap">{muscles.filter(m => m.id !== muscle && m.id !== 'OTHER').map(m => <button key={m.id} className={'chip' + (secondary.includes(m.id) ? ' on' : '')} onClick={() => setSecondary(s => s.includes(m.id) ? s.filter(x => x !== m.id) : [...s, m.id])}>{m.title}</button>)}</div>
      <label style={{ marginTop: 10 }}>Кому доступно</label>
      <Seg options={[['all', 'Всем (в общий справочник)'], ['some', 'Выбранным людям']]} value={isPublic ? 'all' : 'some'} onChange={v => setPublic(v === 'all')} />
      {!isPublic && <>
        <div className="chips wrap">{picked.map(p => <button key={p.id} className="chip on" onClick={() => setPicked(x => x.filter(y => y.id !== p.id))}>{p.email} ✕</button>)}</div>
        <input placeholder="Найти человека по почте или имени" value={q} onChange={e => setQ(e.target.value)} />
        {found.map(u => <div key={u.id} className="list-item" onClick={() => { setPicked(x => [...x, { id: u.id, email: u.email }]); setQ('') }}>{u.name ? `${u.name} — ` : ''}{u.email}</div>)}
      </>}
      <button className="btn block" style={{ marginTop: 14 }} disabled={busy || !title.trim() || !muscle || (!isPublic && !picked.length)} onClick={save}>Сохранить</button>
      {ex.id && <button className="link danger" style={{ marginTop: 8 }} onClick={async () => {
        if (!(await ask('Удалить упражнение?', { text: 'У людей оно пропадёт из справочника (старые подходы останутся).', ok: 'Удалить', danger: true }))) return
        await admin.deleteExercise(ex.id!); toast('Удалено'); onSaved()
      }}>Удалить упражнение</button>}
    </Modal>
  )
}
