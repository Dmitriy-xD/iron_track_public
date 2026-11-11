/* Light / dark theme: "as in Telegram" (default), or fixed by the person. Switching cross-fades smoothly. */
import { useEffect, useState } from 'react'
import { tg } from './tg'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'irontrack.theme'
const BG = { dark: '#070708', light: '#F3F1EE' }

export function getPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
const resolve = (p: ThemePref): 'light' | 'dark' =>
  p !== 'system' ? p : tg?.colorScheme === 'light' || tg?.colorScheme === 'dark' ? tg.colorScheme
    : window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'

export function applyTheme(p: ThemePref = getPref(), animate = false) {
  const t = resolve(p)
  const root = document.documentElement
  if (root.dataset.theme === t) return
  const set = () => {
    root.dataset.theme = t
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[t])
    if (tg?.isVersionAtLeast?.('6.1')) { tg.setHeaderColor(BG[t]); tg.setBackgroundColor(BG[t]) }
    if (tg?.isVersionAtLeast?.('7.10')) tg.setBottomBarColor(BG[t])
  }
  if (!animate) return set()
  root.classList.add('theme-anim')
  set()
  window.setTimeout(() => root.classList.remove('theme-anim'), 450)
}

/** Follows Telegram / the system while the choice is "system". Call once at start. */
export function watchTheme() {
  applyTheme()
  const follow = () => { if (getPref() === 'system') applyTheme('system', true) }
  tg?.onEvent?.('themeChanged', follow)
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', follow)
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getPref)
  useEffect(() => { applyTheme(pref, true) }, [pref])
  return [pref, (p: ThemePref) => { try { localStorage.setItem(KEY, p) } catch { /* storage unavailable */ } setPref(p) }]
}
