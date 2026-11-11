import { useCallback, useEffect, useState } from 'react'
import { User, api, auth, getToken, setActingAs, setToken, setUnauthorizedHandler } from './data/api'
import { Access, AccessProvider, Locked, track, useAccess } from './access'
import { haptic, initTelegram, tg } from './tg'
import { Icon } from './ui/icons'
import { Art, DialogHost, Toast } from './ui/motion'
import { Notebook, StoreProvider, useStore } from './data/store'
import { Admin } from './ui/Admin'
import { Analytics, ExerciseDetail } from './ui/Analytics'
import { Auth } from './ui/Auth'
import { Calendar } from './ui/Calendar'
import { Home } from './ui/Home'
import { Profile } from './ui/Profile'
import { Story } from './ui/Story'
import { Onboarding, onboarded } from './ui/Onboarding'
import { Workout } from './ui/Workout'

type Tab = [string, () => JSX.Element, string]
const TABS: Tab[] = [['home', Icon.home, 'Главная'], ['calendar', Icon.calendar, 'Календарь'], ['workout', Icon.dumbbell, 'Тренировка'], ['analytics', Icon.chart, 'Аналитика'], ['profile', Icon.user, 'Профиль']]

function Splash() {
  return <div className="splash"><Art name="dumbbell" size={150} /><div className="logo">IRONTRACK</div><div className="loadbar" /></div>
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [acting, setActing] = useState<Notebook | null>(null)
  const openNotebook = useCallback((n: Notebook | null) => {
    setActingAs(n?.id ?? null)
    setActing(n)
    history.replaceState(null, '', location.pathname + (n ? '#workout' : '#profile'))
    window.scrollTo(0, 0)
  }, [])
  const [ready, setReady] = useState(false)
  const [access, setAccess] = useState<Access | null>(null)
  const [tgError, setTgError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(t => (t === m ? null : t)), 3500) }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (tg) {
      // Inside Telegram: sign in by the signed initData, no e-mail or password
      initTelegram()
      api<{ access_token: string; user: User; access: Access }>('tg.php?r=auth', { init: tg.initData })
        .then(r => { setToken(r.access_token); setUser(r.user); setAccess(r.access) })
        .catch(e => setTgError((e as Error).message))
        .finally(() => setReady(true))
      return
    }
    if (!getToken()) { setReady(true); return }
    auth.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true))
  }, [])

  const reset = new URLSearchParams(location.search).get('reset')
  if (!ready) return <Splash />
  if (tg && !user) return <div className="landing"><Art name="lock" size={120} /><h1>Не удалось войти</h1><p className="muted">{tgError ?? 'Проверь связь и попробуй ещё раз.'}</p><button className="btn block big" onClick={() => location.reload()}>Повторить</button></div>
  // The public website now only points to Telegram; e-mail sign-in stays reachable for the Android app's users (?email=1)
  if (!tg && !user && !reset && !new URLSearchParams(location.search).has('email')) {
    return (
      <div className="landing">
        <Art name="dumbbell" size={200} />
        <div className="logo">IRONTRACK</div>
        <h1>Дневник тренировок, который считает за тебя</h1>
        <p className="muted">Живёт в Telegram: записывай подходы за 2 секунды, а приложение покажет рекорды, e1RM и подскажет вес на следующий подход.</p>
        <div className="feats">
          <div><Art name="chart" size={40} />Тоннаж, рекорды и прогресс по каждому упражнению</div>
          <div><Art name="muscle" size={40} />Нагрузка по мышцам: что недогружено</div>
          <div><Art name="trophy" size={40} />Итоги недели и план на следующую</div>
        </div>
        <a className="btn block big shine" href="go/?s=web" style={{ textDecoration: 'none' }}>Открыть в Telegram — 3 дня бесплатно</a>
        <p className="muted small" style={{ marginTop: 18 }}><a href="?email=1" style={{ color: 'var(--muted)' }}>Вход по e-mail для приложения на Android</a></p>
      </div>
    )
  }
  if (!user || reset) return <><Auth onSignedIn={setUser} />{toastMsg && <Toast key={toastMsg} text={toastMsg} />}</>
  return (
    <AccessProvider initial={access}>
      <StoreProvider key={acting?.id ?? 'me'} user={user} setUser={setUser} acting={acting} openNotebook={openNotebook} onError={toast}>
        <Shell toast={toast} onSignOut={() => { openNotebook(null); setUser(null) }} />
        {toastMsg && <Toast key={toastMsg} text={toastMsg} />}
        <DialogHost />
      </StoreProvider>
    </AccessProvider>
  )
}

function Shell({ toast, onSignOut }: { toast: (m: string) => void; onSignOut: () => void }) {
  const store = useStore()
  const { access, paywall } = useAccess()
  const isAdmin = store.user.role === 'admin' && !store.acting
  const tabs = isAdmin ? [...TABS, ['admin', Icon.shield, 'Админ'] as Tab] : TABS
  const [tab, setTab] = useState(() => location.hash.replace('#', '') || 'home')
  const [detail, setDetail] = useState<string | null>(null)
  const [story, setStory] = useState(false)
  const [onb, setOnb] = useState(() => !store.acting && !onboarded(store.userId))
  const fresh = !store.loading && !store.error && !store.db.sessions.length && !store.db.plan.length && !store.db.profile.goal
  useEffect(() => { if (tabs.some(t => t[0] === tab)) history.replaceState(null, '', location.pathname + '#' + tab) }, [tab, tabs])
  const go = (t: string) => { if (t !== tab || detail) haptic.tap(); setTab(t); setDetail(null); window.scrollTo(0, 0); track('screen', { name: t }); if (t === 'analytics') track('analytics_open') }
  const openExercise = (n: string) => { setDetail(n); window.scrollTo(0, 0); track('exercise_open', { name: n }) }
  const openStory = () => { track('story_open'); if (access.premium) setStory(true); else paywall('Итоги недели') }
  return (
    <div className="app">
      <nav className="nav" style={{ ['--n' as string]: tabs.length, ['--i' as string]: Math.max(0, tabs.findIndex(x => x[0] === tab)) }}>
        <div className="brand">IRONTRACK</div>
        <i className={'ind' + (detail ? ' off' : '')} />
        {tabs.map(([id, Ico, title]) => (
          <button key={id} className={tab === id && !detail ? 'on' : ''} onClick={() => go(id)} aria-label={title}>
            <Ico />{title}{id === 'workout' && store.active && <span className="live" />}
          </button>
        ))}
      </nav>
      <main>
        {store.acting && (
          <div className="notebook-bar">
            <div><div className="muted small">Блокнот подопечного</div><b>{store.acting.name}</b></div>
            <button className="btn ghost" onClick={() => store.openNotebook(null)}>← К себе</button>
          </div>
        )}
        {store.loading ? <div className="splash" style={{ minHeight: '70vh' }}><Art name="dumbbell" size={110} /><div className="loadbar" /></div>
          : store.error ? <div className="warn"><b>Не удалось загрузить данные</b><div className="muted small">{store.error}</div><button className="link" onClick={store.reload}>Повторить</button></div>
            : <div className="screen" key={detail ? 'x:' + detail : tab}>{detail ? <Locked feature="Прогресс по упражнению"><ExerciseDetail name={detail} onBack={() => setDetail(null)} /></Locked>
              : tab === 'calendar' ? <Calendar />
                : tab === 'workout' ? <Locked feature="Запись тренировок"><Workout toast={toast} /></Locked>
                  : tab === 'analytics' ? <Locked feature="Аналитика"><Analytics openExercise={openExercise} openStory={openStory} /></Locked>
                    : tab === 'profile' ? <Profile toast={toast} onSignOut={onSignOut} />
                      : tab === 'admin' && isAdmin ? <Admin toast={toast} />
                        : <Home go={go} openExercise={openExercise} openStory={openStory} toast={toast} />}</div>}
      </main>
      {story && <Story onClose={() => setStory(false)} />}
      {onb && fresh && <Onboarding onDone={() => { setOnb(false); go('home') }} />}
    </div>
  )
}
