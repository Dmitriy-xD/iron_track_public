import { useState } from 'react'
import { support } from '../data/api'

export const OWNER = { name: 'Жогин Дмитрий Андреевич', phone: '8 905 645-99-28', tel: '+79056459928' }

/** Message to the owner (goes to Telegram) + contacts. Works with and without sign-in. */
export function SupportCard({ signedIn, toast }: { signedIn: boolean; toast?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null)
  const send = async () => {
    setBusy(true); setResult(null)
    try {
      const m = await support.send(text.trim(), contact.trim(), '')
      setText(''); setResult({ text: m, ok: true }); toast?.(m)
    } catch (e) {
      setResult({ text: (e as Error).message, ok: false })
    } finally { setBusy(false) }
  }
  return (
    <div className="card support">
      <h2>Поддержка</h2>
      <p className="muted">Нашли ошибку, есть идея или вопрос — напишите, сообщение придёт напрямую разработчику.</p>
      <textarea rows={3} placeholder="Ваше сообщение" value={text} onChange={e => setText(e.target.value)} maxLength={3000} />
      {!signedIn && <input style={{ marginTop: 8 }} placeholder="Почта или телефон для ответа" value={contact} onChange={e => setContact(e.target.value)} />}
      <button className="btn block" style={{ marginTop: 10 }} disabled={busy || text.trim().length < 3 || (!signedIn && !contact.trim())} onClick={send}>
        {busy ? 'Отправляем…' : 'Отправить'}
      </button>
      {result && <p className={result.ok ? 'ok-text' : 'danger'}>{result.text}</p>}
      <div className="contact">
        <div className="muted small">Связаться напрямую</div>
        <div>{OWNER.name}</div>
        <a href={`tel:${OWNER.tel}`}>{OWNER.phone}</a>
      </div>
    </div>
  )
}

export function LegalLinks() {
  return (
    <p className="legal">
      <a href="./privacy.html" target="_blank" rel="noreferrer">Политика конфиденциальности</a>
      <span>·</span>
      <a href="./terms.html" target="_blank" rel="noreferrer">Пользовательское соглашение</a>
    </p>
  )
}
