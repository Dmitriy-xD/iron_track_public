// Port of Coaching.kt: recommendation pages of the weekly story from the last 4 weeks of logs.
import { CatalogExercise, OTHER, canonical, canonicalKey, isKnown, muscleTitle } from './catalog'
import { Day, DayOf } from './dates'
import { muscleVolume } from './insights'
import { LoggedSet, WORKING, estimatedOneRepMaxKg, exerciseRecords, formatKg } from './metrics'
import { isIsolation, parseGoal, strengthWeightFromE1rm } from './goal'
import type { Note, PlanDay } from './weeklyReview'

export interface CoachPage { emoji: string; title: string; facts: Note[]; tips: Note[] }

const HEAVY_REPS = 6
const fmt = (v: number) => v.toFixed(1)
const minutes = (sec: number) => (sec < 90 ? `${Math.round(sec)} с` : `${fmt(sec / 60)} мин`)
const median = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b), n = s.length
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
const pct = (part: number, total: number) => Math.trunc((part * 100) / total)
const lower = (m: string) => muscleTitle(m).toLowerCase()

/** A heavy (strength) set: tagged strength, or the heavy top set of combo (≤ 6 reps). */
export function isHeavy(s: LoggedSet): boolean {
  const g = parseGoal(s.goal)
  return g === 'strength' || (g === 'combo' && s.reps <= 6)
}

/** Rest before each working set = gap to the previous set of the same session (20 s – 10 min). */
export function restSamples(sets: LoggedSet[]): [LoggedSet, number][] {
  const bySession = new Map<string, LoggedSet[]>()
  for (const s of sets) if (s.sessionId) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s])
  const out: [LoggedSet, number][] = []
  for (const list of bySession.values()) {
    const sorted = [...list].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    for (let i = 1; i < sorted.length; i++) {
      const b = sorted[i], gap = ((b.createdAt ?? 0) - (sorted[i - 1].createdAt ?? 0)) / 1000
      if ((b.kind ?? WORKING) === WORKING && gap >= 20 && gap <= 600) out.push([b, gap])
    }
  }
  return out
}

export function buildCoaching(args: {
  sets: LoggedSet[]; sessions: [number, number | null][]; plan: PlanDay[]
  resolve: (n: string) => CatalogExercise; weekEnd: Day; dayOf: DayOf; bodyweightKg?: number | null
}): CoachPage[] {
  const { sets, sessions, plan, resolve, weekEnd, dayOf, bodyweightKg } = args
  const from = weekEnd - 27
  const inRange = (ms: number) => { const d = dayOf(ms); return d >= from && d <= weekEnd }
  const recent = sets.filter(s => inRange(s.createdAt ?? 0))
  const working = recent.filter(s => (s.kind ?? WORKING) === WORKING && s.reps > 0)
  if (!working.length) return []
  const rests = restSamples(recent)
  const pages: CoachPage[] = []

  // ---------- Strength
  const heavy = working.filter(isHeavy)
  const strengthTagged = working.filter(s => parseGoal(s.goal) === 'strength')
  if (heavy.length || strengthTagged.length) {
    const facts: Note[] = [], tips: Note[] = []
    facts.push({ text: `Тяжёлых подходов за 4 недели: ${heavy.length}` })
    const r = median(rests.filter(([s]) => isHeavy(s)).map(([, g]) => g))
    if (r != null) {
      facts.push({ text: `Отдых перед тяжёлыми подходами ≈ ${minutes(r)}` })
      if (r < 150) tips.push({ text: 'Отдыхай 3–5 минут перед тяжёлым подходом', detail: 'С коротким отдыхом в следующем подходе меньше повторов — сила растёт медленнее. Таймер в режиме «Сила» сам ставит 3 мин.' })
    }
    const rirs = heavy.map(s => s.rir).filter((x): x is number => x != null)
    if (rirs.length >= 3 && pct(rirs.filter(x => x === 0).length, rirs.length) >= 30) {
      facts.push({ text: `${pct(rirs.filter(x => x === 0).length, rirs.length)}% тяжёлых подходов — в отказ` })
      tips.push({ text: 'Для силы отказ не нужен', detail: 'Оставляй 1–2 повтора в запасе: прогресс тот же, а усталость и риск травмы меньше.' })
    }
    const highRep = strengthTagged.filter(s => s.reps > 6).length
    if (strengthTagged.length >= 4 && pct(highRep, strengthTagged.length) >= 40) {
      tips.push({ text: 'Половина «силовых» подходов — по 7+ повторов', detail: 'Это уже работа на массу. Для силы бери вес на 3–5 повторов, лёгкие подходы отмечай как «Масса».' })
    }
    // From sets of 1–6 reps only: Epley overestimates from high-rep sets, so mixing ranges shows fake drops.
    const mid = weekEnd - 13
    const groups = new Map<string, LoggedSet[]>()
    for (const s of heavy) { const k = canonicalKey(s.exercise ?? ''); groups.set(k, [...(groups.get(k) ?? []), s]) }
    for (const list of groups.values()) {
      const name = canonical(list[0].exercise ?? '')
      const all = working.filter(s => canonicalKey(s.exercise ?? '') === canonicalKey(name) && s.reps <= HEAVY_REPS)
      const best = (xs: LoggedSet[]) => (xs.length ? Math.max(...xs.map(s => estimatedOneRepMaxKg(s.weightGrams / 1000, s.reps))) : null)
      const before = best(all.filter(s => dayOf(s.createdAt ?? 0) < mid))
      const after = best(all.filter(s => dayOf(s.createdAt ?? 0) >= mid))
      if (before != null && after != null) {
        const d = after - before
        facts.push({ text: `${name}: 1ПМ ${d >= 0 ? '+' : ''}${fmt(d)} кг за 2 недели` })
        if (d <= 0 && new Set(list.map(s => dayOf(s.createdAt ?? 0))).size >= 4) {
          tips.push({ text: `${name}: силы не прибавляется`, detail: 'Сбрось вес на 10% и пройди подъём заново или переключи упражнение на «Сила + масса».' })
        }
      }
    }
    tips.push({ text: 'Разминка перед тяжёлым: 40 → 60 → 75 → 85%', detail: 'Кнопка «Разминка» на экране тренировки посчитает веса.' })
    tips.push({ text: 'Тяжёлые упражнения — в начало тренировки', detail: 'Пока ты свеж, техника и вес лучше.' })
    pages.push({ emoji: '🏋️', title: 'Как тренировать силу', facts, tips: tips.slice(0, 5) })
  } else {
    let compound: ReturnType<typeof exerciseRecords>[number] | null = null
    for (const rec of exerciseRecords(working)) {
      const ex = resolve(rec.exercise)
      if (isIsolation(ex) || !isKnown(ex)) continue
      if (!compound || rec.bestE1rmKg > compound.bestE1rmKg) compound = rec
    }
    if (compound) {
      const top = strengthWeightFromE1rm(compound.bestE1rmKg, resolve(compound.exercise))
      pages.push({
        emoji: '💡', title: 'Хочешь стать сильнее?',
        facts: [{ text: 'Тяжёлых подходов (1–6 повторов) за 4 недели не было' }, { text: `${compound.exercise}: расчётный 1ПМ ≈ ${fmt(compound.bestE1rmKg)} кг` }],
        tips: [
          { text: `Попробуй режим «Сила + масса» в упражнении «${compound.exercise}»`, detail: `1 тяжёлый подход ≈${formatKg(top)} кг × 3–5, затем 2–3 подхода по 8–12 с весом на 20% меньше.` },
          { text: 'Для силы нужны тяжёлые веса', detail: 'Масса растёт почти при любом весе, если подход близок к отказу, а сила — лучше всего от подходов на 1–6 повторов.' },
          { text: 'Отдых перед тяжёлым подходом — 3–5 минут' }
        ]
      })
    }
  }

  // ---------- Hypertrophy
  const hyper = working.filter(s => !isHeavy(s))
  if (hyper.length) {
    const facts: Note[] = [], tips: Note[] = []
    const r = median(rests.filter(([s]) => !isHeavy(s)).map(([, g]) => g))
    if (r != null) {
      facts.push({ text: `Отдых между подходами на массу ≈ ${minutes(r)}` })
      if (r < 60) tips.push({ text: 'Отдыхай хотя бы 1.5–2 минуты', detail: 'При отдыхе меньше минуты мышцы растут немного хуже: падает число повторов в следующих подходах.' })
      else if (r > 240) tips.push({ text: 'Для массы хватит 2–3 минут отдыха', detail: 'Больше 90–120 с почти не добавляет роста — сэкономишь время.' })
    }
    const rirs = hyper.map(s => s.rir).filter((x): x is number => x != null)
    if (rirs.length >= 5) {
      const avg = rirs.reduce((a, b) => a + b, 0) / rirs.length
      facts.push({ text: `Средний запас повторов: ${fmt(avg)}` })
      if (avg > 3) tips.push({ text: 'Работай ближе к отказу', detail: 'Для роста мышц лучше оставлять 0–2 повтора в запасе, особенно в изолирующих упражнениях.' })
    } else if (hyper.length >= 8) {
      tips.push({ text: 'Отмечай запас повторов (RIR)', detail: 'По нему приложение точнее подскажет, когда добавлять вес.' })
    }
    if (pct(hyper.filter(s => s.reps < 6).length, hyper.length) >= 30) tips.push({ text: 'Много подходов на массу по 1–5 повторов', detail: 'Это скорее силовая работа — отметь её как «Сила» или возьми вес на 6–15 повторов.' })
    if (pct(hyper.filter(s => s.reps > 20).length, hyper.length) >= 30) tips.push({ text: 'Много подходов по 20+ повторов', detail: 'Добавь вес: в диапазоне 6–15 проще дойти близко к отказу и меньше утомление.' })
    const volume = muscleVolume(recent, resolve, from, weekEnd, dayOf).filter(v => v.muscle !== OTHER)
    const planned = [...new Set(plan.flatMap(p => p.exercises).map(n => resolve(n).primary).filter(m => m !== OTHER))]
    const low = planned.filter(m => (volume.find(v => v.muscle === m)?.effective ?? 0) / 4 < 10)
    if (low.length) {
      facts.push({ text: 'В среднем меньше 10 подходов в неделю: ' + low.map(lower).join(', ') })
      tips.push({ text: 'Добавляй по 2 подхода в неделю на отстающие мышцы', detail: 'Больше подходов — больше роста, но с убывающей отдачей. Ориентир — 10–20 в неделю.' })
    }
    const crowdedGroups = new Map<string, LoggedSet[]>()
    for (const s of hyper) {
      if (!s.sessionId) continue
      const k = s.sessionId + '\u0000' + canonicalKey(s.exercise ?? '')
      crowdedGroups.set(k, [...(crowdedGroups.get(k) ?? []), s])
    }
    const crowded = [...crowdedGroups.values()].find(l => l.length >= 6)
    if (crowded) tips.push({ text: `${canonical(crowded[0].exercise ?? '')}: ${crowded.length} подходов за тренировку`, detail: 'После 4–5 подходов отдача падает — раздели объём на два упражнения или два дня.' })
    tips.push({ text: 'Прибавляй по чуть-чуть', detail: 'Сначала повторы до верхней границы диапазона во всех подходах, потом вес — подсказки покажут когда.' })
    pages.push({ emoji: '💪', title: 'Как тренировать массу', facts, tips: tips.slice(0, 5) })
  }

  // ---------- Recovery & regularity
  {
    const facts: Note[] = [], tips: Note[] = []
    const recentSessions = sessions.filter(([st]) => inRange(st))
    facts.push({ text: `Тренировок за 4 недели: ${recentSessions.length} (≈${fmt(recentSessions.length / 4)} в неделю)` })
    const durations = recentSessions.filter(([, f]) => f != null).map(([s, f]) => (f! - s) / 60_000).filter(d => d >= 10 && d <= 300)
    const d = median(durations)
    if (d != null) {
      facts.push({ text: `Средняя тренировка ≈ ${Math.round(d)} мин` })
      if (d > 100) tips.push({ text: 'Тренировки длиннее 1.5 часов', detail: 'Сократи отдых в изолирующих упражнениях до 1.5–2 мин или раздели объём на ещё один день.' })
    }
    const daysByMuscle = new Map<string, Set<Day>>()
    for (const s of working) {
      const m = resolve(s.exercise ?? '').primary
      if (!daysByMuscle.has(m)) daysByMuscle.set(m, new Set())
      daysByMuscle.get(m)!.add(dayOf(s.createdAt ?? 0))
    }
    const once = muscleVolume(recent, resolve, from, weekEnd, dayOf)
      .filter(v => v.muscle !== OTHER && v.effective / 4 >= 10 && (daysByMuscle.get(v.muscle)?.size ?? 0) / 4 < 1.5)
    if (once.length) tips.push({ text: 'Раздели объём на 2 дня: ' + once.map(v => lower(v.muscle)).join(', '), detail: '10+ подходов на мышцу за одну тренировку тяжело выполнить качественно — 2 раза в неделю удобнее.' })
    if (bodyweightKg != null && bodyweightKg > 30) {
      tips.push({ text: `Белок: ${Math.round(bodyweightKg * 1.6)}–${Math.round(bodyweightKg * 2.2)} г в день`, detail: `1.6–2.2 г на кг веса (${fmt(bodyweightKg)} кг) — распредели на 3–5 приёмов пищи.` })
    } else {
      tips.push({ text: 'Белок: 1.6–2.2 г на кг веса в день', detail: 'Запиши вес в профиле — посчитаем точнее.' })
    }
    tips.push({ text: 'Сон 7–9 часов', detail: 'Без сна не растут ни сила, ни масса — это главный фактор восстановления.' })
    tips.push({ text: 'Боль в суставах или спине — сигнал снизить нагрузку', detail: 'Техника важнее веса; при боли — к врачу.' })
    pages.push({ emoji: '🔋', title: 'Восстановление и режим', facts, tips: tips.slice(0, 5) })
  }
  return pages
}
