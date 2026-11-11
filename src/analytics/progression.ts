// Port of Progression.kt: transparent double-progression hint.
import { CatalogExercise } from './catalog'
import { TrainingGoal, backOffWeight, e1rmFraction, floorToStep, strengthReps, strengthWeightFromE1rm } from './goal'
import { ExerciseDay } from './insights'
import { WORKING, formatKg } from './metrics'

export type HintKind = 'FIRST_TIME' | 'BUILD_REPS' | 'INCREASE' | 'REDUCE'
export interface ProgressionHint {
  kind: HintKind; title: string; details: string; targetWeightGrams: number | null; targetReps: number | null
  goal?: TrainingGoal; backOffWeightGrams?: number | null
}

/** Goal-aware hint (port of Progression.suggest(ex, lastDay, goal, bestE1rm)). */
export function suggestFor(ex: CatalogExercise, lastDay: ExerciseDay | null | undefined, goal: TrainingGoal, bestE1rmKg?: number | null): ProgressionHint {
  if (goal === 'hypertrophy') return suggest(ex, lastDay)
  if (goal === 'strength') return strength(ex, lastDay, bestE1rmKg)
  const heavy = strength(ex, lastDay, bestE1rmKg)
  const r = strengthReps(ex)
  if (heavy.targetWeightGrams == null) {
    return { ...heavy, goal: 'combo', title: 'Сила + масса: подбери тяжёлый вес', details: `1 тяжёлый подход на ${r.first}–${r.last} повторов с запасом 1–2, затем 2–3 подхода на ${ex.repsMin}–${ex.repsMax} с весом на ~20% меньше.` }
  }
  const back = backOffWeight(heavy.targetWeightGrams, ex)
  return {
    ...heavy, goal: 'combo', backOffWeightGrams: back,
    title: `Тяжёлый ${formatKg(heavy.targetWeightGrams)} кг × ${r.first}–${r.last}, затем ${formatKg(back)} кг × ${ex.repsMin}–${ex.repsMax}`,
    details: heavy.details + ` После тяжёлого — 2–3 добивочных подхода по ${ex.repsMin}–${ex.repsMax} ближе к отказу (запас 0–2) для массы.`
  }
}

function strength(ex: CatalogExercise, lastDay: ExerciseDay | null | undefined, bestE1rmKg?: number | null): ProgressionHint {
  const r = strengthReps(ex), step = ex.stepGrams
  const heavy = (lastDay?.sets ?? []).filter(s => (s.kind ?? WORKING) === WORKING && s.reps >= 1 && s.reps <= r.last + 1)
  if (!heavy.length) {
    if (bestE1rmKg && bestE1rmKg > 0) {
      const w = strengthWeightFromE1rm(bestE1rmKg, ex)
      return {
        kind: 'FIRST_TIME', goal: 'strength', targetWeightGrams: w, targetReps: r.first,
        title: `Сила: начни с ${formatKg(w)} кг × ${r.first}–${r.last}`,
        details: `Это ≈${Math.trunc(e1rmFraction(r.last, 2) * 100)}% от расчётного 1ПМ ${bestE1rmKg.toFixed(1)} кг: ${r.last} повторов с запасом ~2. 3–5 подходов, отдых 3–4 мин, без отказа. Перед этим — разминка.`
      }
    }
    return { kind: 'FIRST_TIME', goal: 'strength', targetWeightGrams: null, targetReps: r.first, title: `Сила: подбери вес на ${r.first}–${r.last} повторов`, details: `Начни с разминки и выйди на вес, с которым делаешь ${r.last} повторов с запасом 2. Отдых 3–4 мин, без отказа.` }
  }
  const top = Math.max(...heavy.map(s => s.weightGrams))
  const topSets = heavy.filter(s => s.weightGrams === top)
  const minReps = Math.min(...topSets.map(s => s.reps)), maxReps = Math.max(...topSets.map(s => s.reps))
  const rirs = topSets.map(s => s.rir).filter((x): x is number => x != null)
  const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null
  const kg = formatKg(top), repsText = topSets.map(s => s.reps).join(', ')
  if ((minReps >= r.last && (avgRir == null || avgRir >= 1)) || (minReps >= r.first && avgRir != null && avgRir >= 2)) {
    return {
      kind: 'INCREASE', goal: 'strength', targetWeightGrams: top + step, targetReps: r.first,
      title: `Сила: +${formatKg(step)} кг → ${formatKg(top + step)} кг`,
      details: `В прошлый раз ${kg} кг × ${repsText}${avgRir != null ? ` с запасом ≈${Math.round(avgRir)}` : ''}. Запас есть — добавляй вес и снова набирай ${r.first}–${r.last} повторов. Отдых 3–4 мин.`
    }
  }
  if (maxReps < r.first - 1) {
    const lower = floorToStep(Math.trunc((top * 9) / 10), step)
    return { kind: 'REDUCE', goal: 'strength', targetWeightGrams: lower, targetReps: r.first, title: `Сила: снизь до ${formatKg(lower)} кг`, details: `В прошлый раз ${kg} кг × ${repsText} — слишком тяжело для ${r.first}–${r.last}. Сбрось ~10% и поднимайся заново: так растёт сила без срывов техники.` }
  }
  return {
    kind: 'BUILD_REPS', goal: 'strength', targetWeightGrams: top, targetReps: Math.min(Math.max(minReps + 1, r.first), r.last),
    title: `Сила: держи ${kg} кг, цель ${r.first}–${r.last} с запасом 1–2`,
    details: `В прошлый раз ${kg} кг × ${repsText}. Когда все подходы пойдут на ${r.last} с запасом — прибавим ${formatKg(step)} кг. В силе отказ не нужен.` + (avgRir != null && avgRir < 1 ? ' Был отказ — оставляй 1–2 повтора.' : '')
  }
}

export function suggest(ex: CatalogExercise, lastDay: ExerciseDay | null | undefined): ProgressionHint {
  const lo = ex.repsMin, hi = ex.repsMax
  const working = (lastDay?.sets ?? []).filter(s => (s.kind ?? WORKING) === WORKING && s.reps > 0)
  if (!working.length) {
    return { kind: 'FIRST_TIME', title: 'Подбери рабочий вес', details: `Цель — ${lo}–${hi} повторов, оставляя 1–3 в запасе (RIR). Начни легче и добавляй по подходу.`, targetWeightGrams: null, targetReps: lo }
  }
  const top = Math.max(...working.map(s => s.weightGrams))
  const topSets = working.filter(s => s.weightGrams === top)
  const minReps = Math.min(...topSets.map(s => s.reps))
  const maxReps = Math.max(...topSets.map(s => s.reps))
  const rirs = topSets.map(s => s.rir).filter((r): r is number => r != null)
  const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null
  const kg = formatKg(top)
  const repsText = topSets.map(s => s.reps).join(', ')
  const step = ex.stepGrams
  if (minReps >= hi || (avgRir != null && avgRir >= 3 && minReps >= lo)) {
    return {
      kind: 'INCREASE', title: `Пора добавить вес: ${formatKg(top + step)} кг`,
      details: (minReps >= hi ? `В прошлый раз ${kg} кг × ${repsText} — все подходы на верхней границе (${hi}).`
        : `В прошлый раз ${kg} кг × ${repsText} с большим запасом (RIR ≈ ${Math.round(avgRir!)}).`) +
        ` Добавь ${formatKg(step)} кг и начни примерно с ${lo}–${lo + 2} повторов.`,
      targetWeightGrams: top + step, targetReps: lo
    }
  }
  if (maxReps < lo) {
    const lower = Math.floor(Math.floor(top * 9 / 10) / step) * step
    return {
      kind: 'REDUCE', title: `Вес тяжеловат: попробуй ${formatKg(lower)} кг`,
      details: `В прошлый раз ${kg} кг × ${repsText} — ниже диапазона ${lo}–${hi}. Снизь вес примерно на 10% и набирай повторы в диапазоне.`,
      targetWeightGrams: lower, targetReps: lo
    }
  }
  const target = Math.min(minReps + 1, hi)
  return {
    kind: 'BUILD_REPS', title: `Держи ${kg} кг, цель — ${target}+ повторов`,
    details: `В прошлый раз ${kg} кг × ${repsText}. Добавляй по 1 повтору в подходе; когда все подходы дойдут до ${hi}, прибавим ${formatKg(step)} кг.` +
      (avgRir != null && avgRir < 1 ? ' Был отказ (RIR 0) — техника важнее лишнего повтора.' : ''),
    targetWeightGrams: top, targetReps: target
  }
}
