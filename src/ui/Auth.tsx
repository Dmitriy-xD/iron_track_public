import { useState } from 'react'
import { User, auth } from '../data/api'
import { Seg } from './common'
import { LegalLinks, SupportCard } from './Support'

type Mode = 'in' | 'up' | 'forgot'

export function Auth({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const params = new URLSearchParams(location.search)
  const resetToken = params.get('reset')
  const confirmed = params.get('confirmed')
  const [mode, setMode] = useState<Mode>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(
    confirmed === '1' ? { text: 'Почта подтверждена ✓ Теперь войди.', ok: true }
      : confirmed === '0' ? { text: 'Ссылка устарела или уже использована. Попробуй войти или зарегистрируйся ещё раз.', ok: false } : null
  )
  const [unconfirmed, setUnconfirmed] = useState(false)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setMsg(null); setUnconfirmed(false)
    try {
      const text = await f()
      if (text) setMsg({ text, ok: true })
    } catch (e) {
      const text = (e as Error).message
      setMsg({ text, ok: false })
      if (text.includes('не подтверждена')) setUnconfirmed(true)
    } finally { setBusy(false) }
  }
  const clearUrl = () => history.replaceState(null, '', location.pathname)

  const signIn = () => run(async () => { const u = await auth.signIn(email, password); clearUrl(); onSignedIn(u) })
  const signUp = () => run(async () => {
    const text = await auth.signUp(email, password, name.trim(), consent)
    setMode('in'); setPassword('')
    return text
  })

  return (
    <div className="auth">
      <div className="auth-brand">
        <img src="./icon.svg" width="64" height="64" alt="" />
        <div className="logo">IRONTRACK</div>
        <div className="muted">Дневник тренировок с аналитикой, прогнозом подходов и планом</div>
      </div>

      <div className="card">
        {resetToken ? <>
          <h2>Новый пароль</h2>
          <input type="password" autoComplete="new-password" placeholder="Минимум 8 символов" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn block" style={{ marginTop: 12 }} disabled={password.length < 8 || busy} onClick={() => run(async () => {
            const text = await auth.reset(resetToken, password)
            clearUrl(); setPassword(''); setMode('in')
            return text
          })}>Сохранить пароль</button>
          {msg?.ok && <button className="link" onClick={() => location.replace(location.pathname)}>Перейти ко входу →</button>}
        </> : mode === 'forgot' ? <>
          <h2>Восстановление пароля</h2>
          <p className="muted">Пришлём ссылку для нового пароля.</p>
          <label>Почта</label>
          <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value.trim())} />
          <button className="btn block" style={{ marginTop: 12 }} disabled={!validEmail || busy} onClick={() => run(() => auth.recover(email))}>Отправить ссылку</button>
          <button className="link" onClick={() => { setMode('in'); setMsg(null) }}>← Ко входу</button>
        </> : <>
          <Seg options={[['in', 'Вход'], ['up', 'Регистрация']]} value={mode} onChange={m => { setMode(m); setMsg(null) }} />
          {mode === 'up' && <><label>Имя</label><input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Как к тебе обращаться" /></>}
          <label>Почта</label>
          <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value.trim())} />
          <label>{mode === 'up' ? 'Пароль (минимум 8 символов)' : 'Пароль'}</label>
          <input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { if (mode === 'in' && validEmail && password) signIn() } }} />
          {mode === 'up' && (
            <label className="check">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>Я принимаю <a href="./terms.html" target="_blank" rel="noreferrer">пользовательское соглашение</a> и даю согласие на обработку моих персональных данных в соответствии с <a href="./privacy.html" target="_blank" rel="noreferrer">политикой конфиденциальности</a></span>
            </label>
          )}
          <button className="btn block" style={{ marginTop: 12 }}
            disabled={busy || !validEmail || (mode === 'in' ? !password : password.length < 8 || !consent)}
            onClick={mode === 'in' ? signIn : signUp}>
            {busy ? '…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}
          </button>
          {mode === 'in' && <button className="link" onClick={() => { setMode('forgot'); setMsg(null) }}>Забыли пароль?</button>}
          {mode === 'up' && <p className="muted small">После регистрации придёт письмо со ссылкой. Открой её — и можно входить.</p>}
        </>}
        {msg && <p className={msg.ok ? 'ok-text' : 'danger'}>{msg.text}</p>}
        {unconfirmed && <button className="link" disabled={busy} onClick={() => run(() => auth.resend(email))}>Отправить письмо ещё раз</button>}
      </div>

      <SupportCard signedIn={false} />
      <LegalLinks />
    </div>
  )
}
