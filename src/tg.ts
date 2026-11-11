/* Thin wrapper around Telegram.WebApp: IRONTRACK also keeps working as a normal website (e-mail sign-in). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { applyTheme, getPref } from './theme'
const raw: any = (window as any).Telegram?.WebApp
export const tg: any = raw && raw.initData ? raw : null

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
  if (tg.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes()
  applyTheme(getPref())  // header and background colours follow the theme
}

export const haptic = {
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  tap: () => tg?.HapticFeedback?.selectionChanged(),
}

export function openInvoice(url: string): Promise<string> {
  return new Promise(resolve => tg.openInvoice(url, (status: string) => resolve(status)))
}

export function shareLink(url: string, text: string) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  if (tg?.openTelegramLink) tg.openTelegramLink(share)
  else window.open(share, '_blank')
}
