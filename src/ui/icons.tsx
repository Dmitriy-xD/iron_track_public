/* Line icons (24×24, stroke = currentColor). */
import { ReactNode } from 'react'

const I = ({ children, size = 24 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const Icon = {
  home: () => <I><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></I>,
  calendar: () => <I><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></I>,
  dumbbell: () => <I><path d="M7 7v10M17 7v10M4 9.5v5M20 9.5v5M7 12h10" /></I>,
  chart: () => <I><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>,
  user: () => <I><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></I>,
  shield: () => <I><path d="M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6Z" /><path d="m9 12 2 2 4-4" /></I>,
  play: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" /></svg>,
  chevron: () => <I size={20}><path d="m9 6 6 6-6 6" /></I>,
  back: () => <I><path d="M15 6 9 12l6 6" /></I>,
  close: () => <I size={20}><path d="M6 6l12 12M18 6 6 18" /></I>,
  plus: () => <I size={20}><path d="M12 5v14M5 12h14" /></I>,
  check: () => <I size={18}><path d="m5 12.5 4.5 4.5L19 7.5" /></I>,
  timer: () => <I size={20}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2.5h5" /></I>,
  edit: () => <I size={18}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></I>,
}
