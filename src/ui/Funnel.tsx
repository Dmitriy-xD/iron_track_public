/* Admin: Telegram funnel — who came, what they did, where they left, who paid. */
import { useEffect, useState } from 'react'
import { api } from '../data/api'
import { Kpi, Seg } from './common'
import { Art } from './motion'

interface Stats {
  summary: Record<string, number>
  funnel: { label: string; n: number }[]
  sources: { source: string; users: number; trained: number; paid: number; stars: number }[]
  activity: { name: string; count: number; users: number }[]
  churn: { total: number; reasons: { label: string; n: number }[] }
  recent: { id: number; name: string; tg_username: string | null; source: string; created_at: number; last_seen_at: number | null;
    plan: string | null; premium_until: number | null; trial_until: number | null; workouts: number; last_event: string | null }[]
}
interface Person { user: Record<string, unknown>; events: { name: string; meta: string | null; created_at: number }[];
  payments: { product: string; stars: number; created_at: number; refunded: number }[]; workouts: number }

const LABELS: Record<string, string> = {
  signup: 'Новый пользователь', app_open: 'Открыл приложение', screen: 'Экран', workout_start: 'Начал тренировку',
  workout_finish: 'Закончил тренировку', analytics_open: 'Открыл аналитику', story_open: 'Итоги недели', exercise_open: 'Открыл упражнение',
  paywall_view: 'Увидел Premium', paywall_close: 'Закрыл Premium', locked_tap: 'Нажал на замок', invoice_open: 'Нажал «оплатить»',
  paid: '💰 Оплатил', admin_grant: '🎁 Админ выдал доступ', onboarding_done: 'Прошёл знакомство', onboarding_skip: 'Пропустил знакомство', admin_revoke: 'Админ забрал доступ', refunded: 'Возврат', renew_on: 'Включил автопродление', renew_off: 'Выключил автопродление',
  invite_open: 'Открыл приглашение', referral: 'Привёл друга', link_click: 'Переход по ссылке /go',
  reminder_trial_soon: 'Напоминание: пробный кончается', reminder_trial_end: 'Напоминание: пробный кончился', trainer_open: 'Режим тренера',
}
const ago = (ms: number | null) => {
  if (!ms) return '—'
  const m = (Date.now() - ms) / 60000
  return m < 60 ? `${Math.max(1, Math.round(m))} мин` : m < 1440 ? `${Math.round(m / 60)} ч` : `${Math.round(m / 1440)} дн`
}

const until = (ms: number | null | undefined) => (ms && ms > Date.now() ? `до ${new Date(ms).toLocaleDateString('ru-RU')}` : 'нет')

/** Give Premium / Trainer by hand: by @username, name or id — or right from a person's card. */
function Grant({ id, plan: curPlan, current, onDone }: { id?: number; plan?: string | null; current?: number | null; onDone?: (plan: string | null, until: number) => void }) {
  const [who, setWho] = useState('')
  const [plan, setPlan] = useState<'premium' | 'trainer'>('premium')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const run = async (d: number) => {
    if (busy || (!id && !who.trim())) return
    setBusy(true); setMsg('')
    try {
      const r = await api<{ id: number; name: string; tg_username: string | null; plan: string | null; premium_until: number }>('tg.php?r=admin_grant', { ...(id ? { id } : { who: who.trim() }), days: d, plan })
      setMsg(d ? `✓ ${r.name || r.id}${r.tg_username ? ` @${r.tg_username}` : ''}: ${r.plan === 'trainer' ? 'Тренер' : 'Premium'} ${until(r.premium_until)}. Ему пришло сообщение.` : `✓ Доступ у ${r.name || r.id} выключен`)
      onDone?.(r.plan, r.premium_until)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}><Art name="crown" size={40} /><h2 style={{ margin: 0 }}>Выдать доступ вручную</h2></div>
      {id ? <p className="muted small" style={{ marginTop: 0 }}>Сейчас: {curPlan === 'trainer' ? 'Тренер' : 'Premium'} {until(current)}. Дни добавятся к текущему сроку.</p>
        : <input placeholder="@username, имя или ID" value={who} onChange={e => setWho(e.target.value)} style={{ marginBottom: 10 }} />}
      <Seg options={[['premium', 'Premium'], ['trainer', 'Тренер']]} value={plan} onChange={setPlan} />
      <Seg options={[[7, '7 дн'], [30, '30 дн'], [90, '90 дн'], [365, 'Год']]} value={days} onChange={setDays} />
      <button className="btn block" disabled={busy || (!id && !who.trim())} onClick={() => run(days)}>{busy ? 'Выдаю…' : `Выдать ${plan === 'trainer' ? '«Тренер»' : 'Premium'} на ${days === 365 ? 'год' : `${days} дней`}`}</button>
      {id && (current ?? 0) > Date.now() && <button className="link danger" style={{ display: 'block', margin: '10px auto 0' }} onClick={() => run(0)}>Забрать доступ</button>}
      {msg && <p className="small" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  )
}

function Bars({ rows, total }: { rows: { label: string; n: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(r => (
        <div key={r.label}>
          <div className="between small"><span>{r.label}</span><b>{r.n} <span className="muted">· {total ? Math.round(r.n * 100 / total) : 0}%</span></b></div>
          <div style={{ height: 8, background: 'var(--s3)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${r.n * 100 / max}%`, minWidth: 2, height: '100%', background: 'var(--orange)', borderRadius: '0 4px 4px 0' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Funnel() {
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [person, setPerson] = useState<Person | null>(null)
  useEffect(() => { api<Stats>('tg.php?r=admin_stats').then(setS).catch(e => setErr((e as Error).message)) }, [])
  if (err) return <div className="warn"><b>Нет данных</b><div className="muted small">{err}</div></div>
  if (!s) return <p className="muted">Загрузка…</p>
  if (person) {
    const pu = person.user
    return (
      <>
      <Grant id={Number(pu.id)} plan={pu.plan as string | null} current={Number(pu.premium_until ?? 0)}
        onDone={(plan, t) => setPerson({ ...person, user: { ...pu, plan, premium_until: t || null } })} />
      <div className="card">
        <div className="between"><h2>{String(person.user.name)} {person.user.tg_username ? `@${person.user.tg_username}` : ''}</h2><button className="link" onClick={() => setPerson(null)}>← Назад</button></div>
        <p className="muted small">Метка: {String(person.user.source ?? 'без метки')} · тренировок: {person.workouts} · пришёл {new Date(Number(person.user.created_at)).toLocaleString('ru-RU')}</p>
        {person.payments.map((p, i) => <div key={i} className="small">💰 {p.product}, {p.stars}⭐, {new Date(p.created_at).toLocaleDateString('ru-RU')}{p.refunded ? ' (возврат)' : ''}</div>)}
        <div style={{ marginTop: 10 }}>
          {person.events.map((e, i) => (
            <div key={i} className="between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{LABELS[e.name] ?? e.name} <span className="muted">{e.meta && e.meta !== 'null' ? e.meta.slice(0, 60) : ''}</span></span>
              <span className="muted">{new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
      </>
    )
  }
  const sum = s.summary
  return (
    <>
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Kpi label="Людей из Telegram" value={String(sum.users_total)} hint={`+${sum.new_today} сегодня`} />
        <Kpi label="На пробном" value={String(sum.trial_now)} />
        <Kpi label="Купили" value={String(sum.paid_users)} hint={`${sum.stars_total} ⭐ всего`} accent />
        <Kpi label="Активны сегодня" value={String(sum.active_today)} />
        <Kpi label="Premium сейчас" value={String(sum.premium_now)} />
        <Kpi label="Клики по /go" value={String(sum.link_clicks)} />
      </div>
      <Grant />
      <div className="card"><h2>Воронка</h2><Bars rows={s.funnel} total={s.funnel[0]?.n ?? 0} /></div>
      <div className="card"><h2>Почему уходят</h2><p className="muted small">Не заходили 3+ дня: {s.churn.total} чел.</p><Bars rows={s.churn.reasons} total={s.churn.total} /></div>
      <div className="card"><h2>Источники</h2>
        {s.sources.map(r => <div key={r.source} className="between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <b>{r.source}</b><span className="muted">{r.users} пришли · {r.trained} тренировались · {r.paid} купили · {r.stars}⭐</span></div>)}
      </div>
      <div className="card"><h2>Чем занимаются (7 дней)</h2>
        {s.activity.map(a => <div key={a.name} className="between small" style={{ padding: '4px 0' }}><span>{LABELS[a.name] ?? a.name}</span><span className="muted">{a.users} чел. · <b>{a.count}</b></span></div>)}
      </div>
      <div className="card"><h2>Последние</h2>
        {s.recent.map(u => (
          <button key={u.id} className="between small" style={{ width: '100%', padding: '8px 0', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
            onClick={() => api<Person>(`tg.php?r=admin_user&id=${u.id}`).then(setPerson)}>
            <span><b>{u.plan === 'trainer' ? '🏆 ' : (u.premium_until ?? 0) > Date.now() ? '🔥 ' : (u.trial_until ?? 0) > Date.now() ? '🎁 ' : ''}{u.name}</b>
              {u.tg_username ? <span className="muted"> @{u.tg_username}</span> : null}<br />
              <span className="muted">{u.source || 'без метки'} · тренировок {u.workouts} · {LABELS[u.last_event ?? ''] ?? u.last_event ?? '—'}</span></span>
            <span className="muted">{ago(u.last_seen_at)}</span>
          </button>
        ))}
      </div>
    </>
  )
}
