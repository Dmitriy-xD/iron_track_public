/* Telegram plans: 3-day trial → Premium (analytics) / Trainer (notebooks), paid with Stars. Outside Telegram
   (the e-mail website) everything stays open, as before. */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken } from './data/api'
import { haptic, openInvoice, shareLink, tg } from './tg'
import { Art, Modal, ask, tell } from './ui/motion'
import { Icon } from './ui/icons'

export interface Product { id: string; stars: number; days: number; plan: 'premium' | 'trainer'; sub: boolean }
export interface Access {
  plan: 'trial' | 'free' | 'premium' | 'trainer'
  premium: boolean
  trainer: boolean
  trial: boolean
  trial_until: number | null
  premium_until: number | null
  subscription: { active: boolean; renew: boolean }
  products: Product[]
  ref_link?: string
}

const OPEN: Access = { plan: 'premium', premium: true, trainer: true, trial: false, trial_until: null, premium_until: null,
  subscription: { active: false, renew: false }, products: [] }

// ---------------------------------------------------------------- analytics events (batched)

let queue: { name: string; meta?: unknown }[] = []
let timer: number | undefined
export function flush() {
  window.clearTimeout(timer); timer = undefined
  if (!tg || !queue.length || !getToken()) { queue = []; return }
  const events = queue; queue = []
  const token = getToken()
  fetch('./api/tg.php?r=track', { method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Auth-Token': token },
    body: JSON.stringify({ events }) }).catch(() => undefined)
}
export function track(name: string, meta?: unknown) {
  if (!tg) return
  queue.push({ name, meta })
  if (timer === undefined) timer = window.setTimeout(flush, 4000)
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })

// ---------------------------------------------------------------- context

interface Ctx { access: Access; refresh: () => Promise<Access>; paywall: (reason: string) => void }
const AccessCtx = createContext<Ctx>({ access: OPEN, refresh: async () => OPEN, paywall: () => {} })
export const useAccess = () => useContext(AccessCtx)

export function AccessProvider({ initial, children }: { initial: Access | null; children: ReactNode }) {
  const [access, setAccess] = useState<Access>(initial ?? OPEN)
  const [wall, setWall] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (!tg) return OPEN
    const a = await api<Access>('tg.php?r=access')
    setAccess(a)
    return a
  }, [])
  useEffect(() => { if (tg) refresh().catch(() => undefined) }, [refresh])
  const paywall = useCallback((reason: string) => { track('paywall_view', { reason }); setWall(reason) }, [])
  return (
    <AccessCtx.Provider value={{ access: tg ? access : OPEN, refresh, paywall }}>
      {children}
      {wall && <Paywall reason={wall} onClose={() => { track('paywall_close', { reason: wall }); setWall(null) }} />}
    </AccessCtx.Provider>
  )
}

const daysLeft = (ms: number | null) => (ms ? Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000)) : 0)
const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('ru-RU') : '')

// ---------------------------------------------------------------- UI pieces

/** Wraps a paid screen. Shows a teaser card with the unlock button when the plan doesn't include it. */
export function Locked({ need = 'premium', feature, children }: { need?: 'premium' | 'trainer'; feature: string; children: ReactNode }) {
  const { access, paywall } = useAccess()
  const ok = need === 'trainer' ? access.trainer : access.premium
  if (ok) return <>{children}</>
  return (
    <div className="card lock-card">
      <Art name={need === 'trainer' ? 'whistle' : 'lock'} size={120} />
      <h2 style={{ fontSize: 19 }}>{feature}</h2>
      <p className="muted">{need === 'trainer'
        ? 'Блокноты подопечных доступны в тарифе «Тренер». Все записи сохранены — откроются сразу после оплаты.'
        : 'Пробные 3 дня закончились. Все твои тренировки сохранены — с Premium продолжишь записывать и увидишь, как растёшь: тоннаж, рекорды, e1RM и прогноз подходов.'}</p>
      <button className="btn block big shine" onClick={() => { track('locked_tap', { feature }); haptic.tap(); paywall(feature) }}>
        {need === 'trainer' ? 'Открыть «Тренер» — 249 ⭐' : 'Открыть Premium — от 29 ⭐'}
      </button>
    </div>
  )
}

/** Thin line on the home screen: how many trial days are left, or an invitation after the trial. */
export function PlanBanner() {
  const { access, paywall } = useAccess()
  if (!tg) return null
  if (access.trial) {
    const d = daysLeft(access.trial_until)
    return (
      <button className="plan-banner" onClick={() => paywall('banner')}>
        <Art name="gift" size={40} />
        <span className="grow"><b>Полный доступ: ещё {d} {d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}</b><br /><span className="muted small">Всё открыто бесплатно</span></span>
        <span className="link small">Тарифы</span>
      </button>
    )
  }
  if (!access.premium) {
    return (
      <button className="plan-banner off" onClick={() => paywall('banner')}>
        <Art name="lock" size={40} />
        <span className="grow"><b>Пробный период закончился</b><br /><span className="muted small">Открой Premium, чтобы записывать тренировки</span></span>
        <span style={{ color: 'var(--orange)' }}><Icon.chevron /></span>
      </button>
    )
  }
  return null
}

export function Paywall({ reason, onClose }: { reason: string; onClose: () => void }) {
  const { access, refresh } = useAccess()
  const [plan, setPlan] = useState<'month' | 'week' | 'trainer'>(reason.toLowerCase().includes('тренер') ? 'trainer' : 'month')
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const price = (id: string) => access.products.find(p => p.id === id)?.stars ?? 0

  const buy = async () => {
    if (busy) return
    setBusy(true); setMsg('')
    try {
      const product = auto && plan !== 'week' ? `${plan}_auto` : plan
      const { url } = await api<{ url: string }>('tg.php?r=invoice', { product })
      const status = await openInvoice(url)
      if (status === 'paid') {
        setMsg('Оплата прошла, включаем…')
        for (let i = 0; i < 10; i++) {
          const a = await refresh()
          if (a.plan === 'premium' || a.plan === 'trainer') { haptic.ok(); onClose(); return }
          await new Promise(r => setTimeout(r, 1500))
        }
        setMsg('Оплата получена, доступ включится в течение минуты. Если нет — напиши /paysupport боту.')
      } else if (status === 'failed') setMsg('Оплата не прошла, попробуй ещё раз.')
    } catch (e) {
      setMsg((e as Error).message || 'Не удалось открыть оплату')
    } finally { setBusy(false) }
  }

  const Option = ({ id, title, hint, badge }: { id: 'month' | 'week' | 'trainer'; title: string; hint: string; badge?: string }) => (
    <button className={`plan-opt ${plan === id ? 'on' : ''}`} onClick={() => { haptic.tap(); setPlan(id) }}>
      {badge && <span className="plan-badge">{badge}</span>}
      <span className="radio" />
      <span className="grow" style={{ textAlign: 'left' }}><b>{title}</b><br /><span className="muted small">{hint}</span></span>
      <span className="price">{price(id)} ⭐</span>
    </button>
  )

  return (
    <Modal onClose={onClose} className="paywall">
        <div className="pw-hero">
          <button className="icon-btn pw-close" onClick={onClose} aria-label="Закрыть"><Icon.close /></button>
          <Art name={plan === 'trainer' ? 'whistle' : 'crown'} size={130} />
          <h1>IRONTRACK Premium</h1>
        </div>
        <p className="muted" style={{ marginTop: 0, textAlign: 'center' }}>{access.trial ? `Пробный период: осталось ${daysLeft(access.trial_until)} дн.` : 'Пробные 3 дня закончились — все тренировки сохранены, продолжай с Premium.'}</p>
        <ul className="perks">
          <li>Запись тренировок — подход за 2 секунды, даже без интернета</li>
          <li>Тоннаж, рекорды и e1RM по каждому упражнению</li>
          <li>Прогноз: сколько повторов и какой вес дальше</li>
          <li>Итоги недели: какие мышцы недогружены</li>
          <li>Прямая и косвенная нагрузка по мышцам</li>
          <li>Отчёты для себя и тренера</li>
        </ul>
        <div style={{ display: 'grid', gap: 10, margin: '14px 0' }}>
          <Option id="month" title="Premium на 30 дней" hint="Меньше 3 ⭐ в день" badge="Выгоднее" />
          <Option id="week" title="Premium на 7 дней" hint="Попробовать ещё неделю" />
          <Option id="trainer" title="Тренер на 30 дней" hint="Premium + блокноты подопечных" />
        </div>
        {plan !== 'week' && (
          <div className="card between" style={{ padding: 14 }}>
            <div><b>Автопродление</b><div className="muted small">{auto ? `Каждые 30 дней спишется ${price(plan)} ⭐. Выключается в профиле.` : 'Выключено: оплата один раз, без списаний потом.'}</div></div>
            <button className={`toggle ${auto ? 'on' : ''}`} onClick={() => setAuto(!auto)} aria-label="Автопродление" />
          </div>
        )}
        <button className="btn block big shine" disabled={busy} onClick={buy}>{busy ? 'Открываем оплату…' : `Оплатить ${price(plan)} ⭐`}</button>
        {msg && <p className="muted small" style={{ textAlign: 'center' }}>{msg}</p>}
        {access.ref_link && (
          <button className="link" style={{ display: 'block', margin: '12px auto 0' }}
            onClick={() => { track('invite_open'); shareLink(access.ref_link!, 'Записываю тренировки в IRONTRACK — смотри, как растут рабочие веса 💪') }}>
            🎁 Пригласи друга — вам обоим +3 дня бесплатно
          </button>
        )}
        <p className="muted small" style={{ textAlign: 'center' }}>Оплата звёздами Telegram. Условия — /terms в боте.</p>
    </Modal>
  )
}

/** Profile card: current plan, auto-renewal switch, invite link. */
export function PlanCard() {
  const { access, refresh, paywall } = useAccess()
  const [busy, setBusy] = useState(false)
  if (!tg) return null
  const toggle = async () => {
    if (busy) return
    const on = !access.subscription.renew
    if (!on && !(await ask('Выключить автопродление?', { text: `Доступ останется до ${date(access.premium_until)}, дальше списаний не будет.`, ok: 'Выключить' }))) return
    setBusy(true)
    try { await api('tg.php?r=sub_renew', { on }); await refresh() } catch (e) { tell('Не получилось', (e as Error).message) } finally { setBusy(false) }
  }
  const title = access.plan === 'trainer' ? 'Тренер' : access.plan === 'premium' ? 'Premium' : access.trial ? 'Пробный период' : 'Бесплатный'
  return (
    <div className="card">
      <div className="between">
        <div className="row"><Art name={access.plan === 'trainer' ? 'whistle' : access.premium && !access.trial ? 'crown' : access.trial ? 'gift' : 'lock'} size={46} /><div><h2 style={{ margin: 0 }}>{title}</h2>
          <div className="muted small">{access.premium_until ? `до ${date(access.premium_until)}` : access.trial ? `до ${date(access.trial_until)}` : 'Пробный период закончился'}</div></div></div>
        {access.plan !== 'trainer' && <button className="btn" onClick={() => paywall('profile')}>{access.premium && !access.trial ? 'Продлить' : 'Premium'}</button>}
      </div>
      {access.subscription.active && (
        <div className="between" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div><b>Автопродление</b><div className="muted small">{access.subscription.renew ? `Следующее списание ${date(access.premium_until)}` : `Выключено — после ${date(access.premium_until)} списаний не будет`}</div></div>
          <button className={`toggle ${access.subscription.renew ? 'on' : ''}`} disabled={busy} onClick={toggle} aria-label="Автопродление" />
        </div>
      )}
      {access.ref_link && (
        <button className="btn ghost block" style={{ marginTop: 14 }}
          onClick={() => { track('invite_open'); shareLink(access.ref_link!, 'Записываю тренировки в IRONTRACK — смотри, как растут рабочие веса 💪') }}>
          🎁 Пригласить друга: вам обоим +3 дня
        </button>
      )}
    </div>
  )
}
