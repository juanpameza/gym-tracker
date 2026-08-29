// ---------------------------------------------------------------
// Workout-log helpers shared by the log page, dashboard and nav bar:
// the stored shape of `workout_logs.exercises`, the single definition
// of a "complete" day, where the next session is, and which weight a
// day should prescribe (imported plan vs auto-progression).
// ---------------------------------------------------------------
import { nextWeight, normalizeRPE, type SetLog } from './progression'
import type { DayRoutine, Exercise, Routine } from './routine'

export interface ExerciseLog {
  sets: SetLog[]
  note?: string
  // The weight this session prescribed, stamped on save. A set logged with
  // reps but no weight was done at this weight, so later weeks can read it back.
  prescribed?: number
}

// workout_logs.exercises: { [exId]: { sets: [{ weight, reps, rpe }], note?, prescribed? } }
export type ExercisesMap = Record<string, ExerciseLog>

// Prescribed weight for every exercise of every day of a week, keyed day → exId.
export type WeekPrescriptions = Record<number, Record<string, number>>

// Coerce a raw JSONB value into a well-formed map: strings for weight/reps,
// RPE on the 7–10 scale (legacy easy/perfect/hard included), note only if set.
export function normalizeExercises(raw: unknown): ExercisesMap {
  const out: ExercisesMap = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue
    const v = val as { sets?: unknown; note?: unknown; prescribed?: unknown }
    const sets: SetLog[] = Array.isArray(v.sets)
      ? v.sets.map(s => {
          const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
          return {
            weight: o.weight == null ? '' : String(o.weight),
            reps: o.reps == null ? '' : String(o.reps),
            rpe: normalizeRPE(o.rpe),
          }
        })
      : []
    const note = typeof v.note === 'string' && v.note.trim() ? v.note : undefined
    const prescribed = typeof v.prescribed === 'number' && Number.isFinite(v.prescribed) ? v.prescribed : undefined
    out[id] = { sets, ...(note ? { note } : {}), ...(prescribed !== undefined ? { prescribed } : {}) }
  }
  return out
}

export function filledSets(sets: SetLog[] | undefined): number {
  return (sets ?? []).filter(s => s.reps !== '').length
}

// A day is complete once every prescribed set of every exercise has reps logged
// (the same rule that turns an exercise card green and fires the feed activity).
export function isDayComplete(
  day: DayRoutine | undefined,
  log: ExercisesMap | null | undefined
): boolean {
  if (!day || !log || day.exercises.length === 0) return false
  return day.exercises.every(ex => filledSets(log[ex.id]?.sets) >= ex.sets)
}

export interface LogRow {
  week_num: number
  day_num: number
  exercises: unknown
}

export interface NextWorkout {
  week: number
  day: number
  latestWeek: number
  startedDays: Set<number> // days of latestWeek with a log row
  completeDays: Set<number> // days of latestWeek that are fully logged
}

// Where the LOG tab / dashboard should send you. Within the latest week that
// has any log: the highest-numbered day you've started, if it's unfinished;
// otherwise the first day you haven't started; otherwise week N+1, day 1.
// A deliberately skipped set on an earlier day therefore never traps you, and
// the week only rolls over once its last day is actually finished (or you've
// already logged something in the next week).
export function nextWorkout(routine: Routine, logs: LogRow[]): NextWorkout {
  const dayKeys = Object.keys(routine)
  const latestWeek = logs.reduce((m, l) => Math.max(m, l.week_num), 0) || 1
  const startedDays = new Set<number>()
  const completeDays = new Set<number>()
  for (const l of logs) {
    if (l.week_num !== latestWeek) continue
    startedDays.add(l.day_num)
    if (isDayComplete(routine[dayKeys[l.day_num - 1]], normalizeExercises(l.exercises))) {
      completeDays.add(l.day_num)
    }
  }
  const base = { latestWeek, startedDays, completeDays }

  const highest = [...startedDays].reduce((m, d) => Math.max(m, d), 0)
  if (highest > 0 && !completeDays.has(highest)) return { ...base, week: latestWeek, day: highest }

  const firstUnstarted = dayKeys.findIndex((_, i) => !startedDays.has(i + 1))
  if (firstUnstarted !== -1) return { ...base, week: latestWeek, day: firstUnstarted + 1 }

  return { ...base, week: latestWeek + 1, day: 1 }
}

export interface PriorLog {
  exercises: ExercisesMap
  loggedAt: string | null
}

// Which weight a day prescribes for an exercise:
//  • no earlier session for this day → the routine's weight (fresh program);
//  • routine (re)imported AFTER the most recent earlier session → the imported
//    weight verbatim — Claude's prescription wins over auto-progression;
//  • otherwise → auto-progress from what was actually lifted last time.
export function prescribedWeight(
  ex: Exercise,
  prior: PriorLog | null | undefined,
  routineUpdatedAt: string | null
): number {
  if (!prior) return ex.weight
  const priorLog = prior.exercises[ex.id]
  if (!priorLog?.sets.length) return ex.weight
  if (
    routineUpdatedAt &&
    prior.loggedAt &&
    Date.parse(prior.loggedAt) < Date.parse(routineUpdatedAt)
  ) {
    return ex.weight
  }
  // Blank-weight sets in the prior session were done at THAT session's
  // prescription (stamped on save); older logs without it fall back to the
  // routine's weight.
  return nextWeight(ex.progKey, ex.reps, priorLog.prescribed ?? ex.weight, ex.unit, priorLog.sets)
}

export function prescribedForDay(
  day: DayRoutine | undefined,
  prior: PriorLog | null | undefined,
  routineUpdatedAt: string | null
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const ex of day?.exercises ?? []) out[ex.id] = prescribedWeight(ex, prior, routineUpdatedAt)
  return out
}
