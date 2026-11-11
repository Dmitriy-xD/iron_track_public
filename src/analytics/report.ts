// Port of Report.kt: plain-text report to share or save.
import { CatalogExercise, canonicalKey, muscleTitle } from './catalog'
import { Day, DayOf, formatDay, isoDow } from './dates'
import { adherence, exerciseStats, muscleVolume } from './insights'
import { LoggedSet, completedWorkingSets, exerciseRecords, formatKg, tonnageGrams } from './metrics'

export interface ReportInput {
  title: string; from: Day; to: Day; today: Day; dayOf: DayOf; athleteName: string
  sets: LoggedSet[]; sessions: [number, number | null][]; bodyweights: [Day, number][]
  plannedDays: Set<number>; resolve: (n: string) => CatalogExercise
}

const fmt1 = (v: number) => v.toFixed(1)
const fmtSets = (v: number) => (v % 1 === 0 ? String(v) : fmt1(v))

export function buildReport(i: ReportInput): string {
  const inPeriod = (ms: number) => { const d = i.dayOf(ms); return d >= i.from && d <= i.to }
  const sessions = i.sessions.filter(([s]) => inPeriod(s))
  const sets = i.sets.filter(s => inPeriod(s.createdAt ?? 0))
  const earlier = i.sets.filter(s => i.dayOf(s.createdAt ?? 0) < i.from)
  const out: string[] = []
  out.push(`IRONTRACK — ${i.title}`)
  if (i.athleteName.trim()) out.push(`Атлет: ${i.athleteName}`)
  out.push(`Период: ${formatDay(i.from)} — ${formatDay(i.to)}`, '')
  const minutes = sessions.filter(([, f]) => f != null).map(([s, f]) => Math.trunc((f! - s) / 60_000)).filter(m => m >= 1 && m <= 600)
  out.push(`Тренировок: ${sessions.length}`)
  if (minutes.length) out.push(`Среднее время тренировки: ${Math.trunc(minutes.reduce((a, b) => a + b, 0) / minutes.length)} мин`)
  const adh = adherence(i.plannedDays, new Set(sessions.map(([s]) => i.dayOf(s))), i.from, i.to, i.today, isoDow)
  if (adh.planned > 0) out.push(`Выполнение плана: ${adh.done} из ${adh.planned} (${adh.percent}%)`)
  out.push(`Рабочих подходов: ${completedWorkingSets(sets)}`, `Рабочий тоннаж: ${formatKg(tonnageGrams(sets))} кг`, '')

  const muscles = muscleVolume(sets, i.resolve, i.from, i.to, i.dayOf)
  if (muscles.length) {
    out.push('Подходы по группам мышц (прямые + косвенные × ½):')
    for (const v of muscles) out.push(`  • ${muscleTitle(v.muscle)}: ${fmtSets(v.effective)}${v.indirect > 0 ? ` (${v.direct} прям. + ${v.indirect} косв.)` : ''}`)
    out.push('')
  }
  const stats = exerciseStats(sets, i.resolve, i.from, i.to, i.dayOf)
  if (stats.length) {
    out.push('Тоннаж по упражнениям:')
    for (const s of stats) out.push(`  • ${s.name}: ${formatKg(s.tonnageGrams)} кг, ${s.workingSets} подх., макс ${formatKg(s.maxWeightGrams)} кг`)
    out.push('')
  }
  const before = new Map(exerciseRecords(earlier).map(r => [canonicalKey(r.exercise), r]))
  const now = exerciseRecords(sets)
  if (now.length) {
    out.push('Лучший расчётный 1ПМ за период:')
    for (const r of now) {
      const prev = before.get(canonicalKey(r.exercise))
      const delta = !prev ? ' (первый результат)' : r.bestE1rmKg > prev.bestE1rmKg + 0.05 ? ` (рекорд, +${fmt1(r.bestE1rmKg - prev.bestE1rmKg)} кг)` : ''
      out.push(`  • ${r.exercise}: ≈${fmt1(r.bestE1rmKg)} кг — ${formatKg(r.weightGrams)}×${r.reps}${delta}`)
    }
    out.push('')
  }
  const weights = i.bodyweights.filter(([d]) => d >= i.from && d <= i.to).sort((a, b) => a[0] - b[0])
  if (weights.length) {
    const diff = weights[weights.length - 1][1] - weights[0][1]
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±'
    out.push(`Вес тела: ${formatKg(weights[weights.length - 1][1])} кг (${sign}${formatKg(Math.abs(diff))} кг за период)`, '')
  }
  out.push('1ПМ рассчитан по формуле Эпли и является оценкой. Отчёт не является медицинской рекомендацией.')
  return out.join('\n')
}
