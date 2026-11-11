// Local calendar dates as integer "epoch days" (days since 1970-01-01), like LocalDate.toEpochDay().
export type Day = number
export type DayOf = (millis: number) => Day

const MS_DAY = 86_400_000

/** Calendar day of a timestamp in the browser's time zone. */
export const localDay: DayOf = (ms) => {
  const d = new Date(ms)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DAY)
}

/** Fixed UTC offset in minutes (for tests): Moscow = 180. */
export const dayInOffset = (offsetMinutes: number): DayOf => (ms) => Math.floor((ms + offsetMinutes * 60_000) / MS_DAY)

export const today = (): Day => localDay(Date.now())
/** ISO day of week: 1 = Monday ... 7 = Sunday. 1970-01-01 was a Thursday. */
export const isoDow = (d: Day) => ((((d + 3) % 7) + 7) % 7) + 1
export const weekStart = (d: Day) => d - (isoDow(d) - 1)
export const fromYmd = (y: number, m: number, day: number): Day => Math.floor(Date.UTC(y, m - 1, day) / MS_DAY)
export const toDate = (d: Day) => new Date(d * MS_DAY) // UTC midnight of that day; use getUTC* to read
export const startOfDayMillis = (d: Day) => { const x = toDate(d); return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()).getTime() }

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const DAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

export const formatDay = (d: Day) => { const x = toDate(d); return `${x.getUTCDate()} ${MONTHS_GEN[x.getUTCMonth()]} ${x.getUTCFullYear()}` }
export const formatShort = (d: Day) => { const x = toDate(d); return `${x.getUTCDate()} ${MONTHS_SHORT[x.getUTCMonth()]}` }
export const formatDM = (d: Day) => { const x = toDate(d); return `${x.getUTCDate()}.${x.getUTCMonth() + 1}` }
export const formatDateTime = (ms: number) => {
  const x = new Date(ms)
  return `${x.getDate()} ${MONTHS_SHORT[x.getMonth()]} ${x.getFullYear()}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
