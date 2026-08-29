// ---------------------------------------------------------------
// Progress aggregation for the /progress tab and its Claude export.
// Pure functions over the user's full workout history — no I/O, so
// the numbers are testable and the page is just a query + layout.
// ---------------------------------------------------------------
import { calc1RM } from './epley'
import {
  filledSets,
  isDayComplete,
  normalizeExercises,
  prescribedForDay,
  type ExercisesMap,
  type PriorLog,
  type WeekPrescriptions,
} from './logs'
import type { SetLog } from './progression'
import type { Routine } from './routine'

export interface ProgressLogRow {
  week_num: number
  day_num: number
  logged_at: string | null
  exercises: unknown
}

export interface NormLog {
  week: number
  day: number
  loggedAt: string | null
  exercises: ExercisesMap
}

export function normalizeLogs(rows: ProgressLogRow[]): NormLog[] {
  return rows
    .map(r => ({
      week: r.week_num,
      day: r.day_num,
      loggedAt: r.logged_at ?? null,
      exercises: normalizeExercises(r.exercises),
    }))
    .sort((a, b) => a.week - b.week || a.day - b.day)
}

// Weight a set was done at: the typed weight, else the session's prescription
// (stamped on save), else unknown (0 — contributes nothing).
function setWeight(s: SetLog, prescribed: number | undefined): number {
  if (s.weight !== '') return parseFloat(s.weight) || 0
  return prescribed ?? 0
}

// Total lbs lifted in one session (Σ weight × reps).
export function logTonnage(exercises: ExercisesMap): number {
  let total = 0
  for (const e of Object.values(exercises)) {
    for (const s of e.sets) {
      const reps = parseInt(s.reps) || 0
      if (reps > 0) total += setWeight(s, e.prescribed) * reps
    }
  }
  return total
}

// ── Week by week ───────────────────────────────────────────────────────
export interface WeekStat {
  week: number
  planned: number // days in the routine
  started: number // days with a log row
  completed: number // days where every prescribed set has reps
  sets: number
  tonnage: number
  tonnageByDay: Record<number, number>
  firstLoggedAt: string | null
}

// One entry per week from 1 to the latest logged week — skipped weeks show as zeros.
export function weeklyStats(routine: Routine, logs: NormLog[]): WeekStat[] {
  const dayKeys = Object.keys(routine)
  const maxWeek = logs.reduce((m, l) => Math.max(m, l.week), 0)
  const out: WeekStat[] = []
  for (let w = 1; w <= maxWeek; w++) {
    const stat: WeekStat = {
      week: w,
      planned: dayKeys.length,
      started: 0,
      completed: 0,
      sets: 0,
      tonnage: 0,
      tonnageByDay: {},
      firstLoggedAt: null,
    }
    for (const l of logs) {
      if (l.week !== w) continue
      stat.started++
      if (isDayComplete(routine[dayKeys[l.day - 1]], l.exercises)) stat.completed++
      const t = logTonnage(l.exercises)
      stat.tonnage += t
      stat.tonnageByDay[l.day] = (stat.tonnageByDay[l.day] ?? 0) + t
      stat.sets += Object.values(l.exercises).reduce((a, e) => a + filledSets(e.sets), 0)
      if (l.loggedAt && (!stat.firstLoggedAt || l.loggedAt < stat.firstLoggedAt)) stat.firstLoggedAt = l.loggedAt
    }
    out.push(stat)
  }
  return out
}

// Consecutive fully-completed weeks counted back from the latest complete
// week. A latest week that is still in progress doesn't break the streak.
export function weekStreak(stats: WeekStat[]): number {
  let i = stats.length - 1
  if (i >= 0 && stats[i].completed < stats[i].planned) i--
  let n = 0
  for (; i >= 0; i--) {
    if (stats[i].planned > 0 && stats[i].completed >= stats[i].planned) n++
    else break
  }
  return n
}

// ── Per-exercise strength trend ────────────────────────────────────────
export interface ExercisePoint {
  week: number
  date: string | null
  est1rm: number
  weight: number
  reps: number
  prescribed: number | null
}

export type EtaStatus = 'reached' | 'on-track' | 'behind' | 'stalled' | 'insufficient'

export interface Eta {
  status: EtaStatus
  perWeek: number | null // est. 1RM gained per week (regression slope)
  weeks: number | null // weeks until target at that rate
  date: string | null // ISO date the target is projected to be hit
}

export interface ExerciseSeries {
  id: string
  name: string
  target: number | null
  day0: number | null
  points: ExercisePoint[] // one per logged week, ascending
  current: number | null
  best: number | null
  pct: number | null
  eta: Eta | null
}

export interface Day0Snapshot {
  completedAt: string | null
  results: Record<string, { est1rm?: number }>
}

export function exerciseSeries(
  routine: Routine,
  targets: Record<string, number>,
  day0: Day0Snapshot | null,
  logs: NormLog[],
  opts: { now: Date; horizonEnd: Date | null }
): ExerciseSeries[] {
  const seen = new Set<string>()
  const out: ExerciseSeries[] = []
  for (const day of Object.values(routine)) {
    for (const ex of day.exercises) {
      if (seen.has(ex.id) || ex.unit === 'BW') continue
      seen.add(ex.id)

      // Best estimated 1RM per week (an exercise may appear on several days).
      const byWeek = new Map<number, ExercisePoint>()
      for (const l of logs) {
        const e = l.exercises[ex.id]
        if (!e) continue
        for (const s of e.sets) {
          const reps = parseInt(s.reps) || 0
          const w = setWeight(s, e.prescribed)
          if (!reps || !w) continue
          const est = calc1RM(w, reps)
          if (!est) continue
          const cur = byWeek.get(l.week)
          if (!cur || est > cur.est1rm) {
            byWeek.set(l.week, {
              week: l.week,
              date: l.loggedAt,
              est1rm: Math.round(est),
              weight: w,
              reps,
              prescribed: e.prescribed ?? null,
            })
          }
        }
      }
      const points = [...byWeek.values()].sort((a, b) => a.week - b.week)
      const day0Est = day0?.results[ex.id]?.est1rm ?? null
      const current = points.length ? points[points.length - 1].est1rm : day0Est
      const best = points.reduce((m, p) => Math.max(m, p.est1rm), day0Est ?? 0) || null
      const target = targets[ex.id] ?? null
      const pct = target && current ? Math.min(100, Math.round((current / target) * 100)) : null
      const eta =
        target && current
          ? projectEta(regressionPoints(points, day0Est, day0?.completedAt ?? null), current, target, opts.now, opts.horizonEnd)
          : null
      out.push({ id: ex.id, name: ex.name, target, day0: day0Est, points, current, best, pct, eta })
    }
  }
  return out
}

// Time axis for the trend fit: real dates when every point has one, else
// program weeks × 7 days (Day 0 = day 0).
function regressionPoints(
  points: ExercisePoint[],
  day0Est: number | null,
  day0At: string | null
): { t: number; y: number }[] {
  const pts: { date: string | null; week: number; y: number }[] = []
  if (day0Est) pts.push({ date: day0At, week: 0, y: day0Est })
  for (const p of points) pts.push({ date: p.date, week: p.week, y: p.est1rm })
  const allDated = pts.length > 0 && pts.every(p => p.date)
  if (allDated) {
    const times = pts.map(p => Date.parse(p.date as string))
    const t0 = Math.min(...times)
    return pts.map((p, i) => ({ t: (times[i] - t0) / 86_400_000, y: p.y }))
  }
  return pts.map(p => ({ t: p.week * 7, y: p.y }))
}

// Straight-line (least squares) projection of est. 1RM to the target.
export function projectEta(
  pts: { t: number; y: number }[],
  current: number,
  target: number,
  now: Date,
  horizonEnd: Date | null
): Eta {
  if (current >= target) return { status: 'reached', perWeek: null, weeks: 0, date: null }
  if (pts.length < 2) return { status: 'insufficient', perWeek: null, weeks: null, date: null }

  const n = pts.length
  const mt = pts.reduce((a, p) => a + p.t, 0) / n
  const my = pts.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.t - mt) * (p.y - my)
    den += (p.t - mt) ** 2
  }
  if (den === 0) return { status: 'insufficient', perWeek: null, weeks: null, date: null }

  const perWeek = (num / den) * 7
  if (perWeek <= 0) return { status: 'stalled', perWeek, weeks: null, date: null }

  const weeks = (target - current) / perWeek
  const date = new Date(now.getTime() + weeks * 7 * 86_400_000)
  const status: EtaStatus = horizonEnd && date > horizonEnd ? 'behind' : 'on-track'
  return { status, perWeek, weeks, date: date.toISOString() }
}

// "3 months" / "6 months" / "12 months" from the intake → a calendar date
// counted from the program start; "Ongoing" (or unknown) → no deadline.
export function horizonEnd(profile: Record<string, string>, startIso: string | null, now: Date): Date | null {
  const m = /(\d+)\s*month/i.exec(profile.horizon ?? '')
  if (!m) return null
  const d = new Date(startIso ? Date.parse(startIso) : now.getTime())
  d.setMonth(d.getMonth() + parseInt(m[1]))
  return d
}

// ── Notes ──────────────────────────────────────────────────────────────
export interface NoteEntry {
  week: number
  day: number
  exId: string
  name: string
  note: string
}

export function notesDigest(routine: Routine, logs: NormLog[]): NoteEntry[] {
  const names = new Map<string, string>()
  for (const day of Object.values(routine)) for (const ex of day.exercises) names.set(ex.id, ex.name)
  const out: NoteEntry[] = []
  for (const l of logs) {
    for (const [exId, e] of Object.entries(l.exercises)) {
      const note = e.note?.trim()
      if (note) out.push({ week: l.week, day: l.day, exId, name: names.get(exId) ?? exId, note })
    }
  }
  return out
}

// ── Prescriptions for an upcoming week, from the full history ──────────
export function prescriptionsForWeek(
  routine: Routine,
  logs: NormLog[],
  week: number,
  routineUpdatedAt: string | null
): WeekPrescriptions {
  const out: WeekPrescriptions = {}
  Object.keys(routine).forEach((dk, i) => {
    const dn = i + 1
    let prior: NormLog | null = null
    for (const l of logs) {
      if (l.day === dn && l.week < week && (!prior || l.week > prior.week)) prior = l
    }
    const priorLog: PriorLog | null = prior ? { exercises: prior.exercises, loggedAt: prior.loggedAt } : null
    out[dn] = prescribedForDay(routine[dk], priorLog, routineUpdatedAt)
  })
  return out
}

// ── Claude export ──────────────────────────────────────────────────────
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function etaLine(eta: Eta | null, horizon: Date | null): string {
  if (!eta) return 'no target'
  switch (eta.status) {
    case 'reached':
      return 'target reached'
    case 'insufficient':
      return 'not enough data for a projection yet'
    case 'stalled':
      return `stalled (trend ${eta.perWeek !== null ? eta.perWeek.toFixed(1) : '0'} lbs/wk)`
    default: {
      const rate = `${eta.perWeek !== null && eta.perWeek >= 0 ? '+' : ''}${eta.perWeek?.toFixed(1)} lbs/wk`
      const when = `ETA ${fmtDate(eta.date)}`
      const vs = horizon ? ` — ${eta.status === 'on-track' ? 'on track' : 'behind'} for ${fmtDate(horizon.toISOString())}` : ''
      return `${rate} · ${when}${vs}`
    }
  }
}

export function formatProgressExport(a: {
  profile: Record<string, string>
  routine: Routine
  targets: Record<string, number>
  weeks: WeekStat[]
  series: ExerciseSeries[]
  notes: NoteEntry[]
  streak: number
  nextWeek: number
  prescribed: WeekPrescriptions
  horizonEnd: Date | null
}): string {
  const { profile, routine, targets, weeks, series, notes, streak, nextWeek, prescribed, horizonEnd } = a
  const days = Object.keys(routine)
  const trained = weeks.filter(w => w.started > 0).length

  let text = 'You are my strength-training coach. Below is a multi-week progress report exported from my tracking app — '
  text += `${trained} week${trained === 1 ? '' : 's'} of training. I want a block-level review, not a single-week tweak.\n\n`

  const who: string[] = []
  if (profile.experience) who.push(`${profile.experience} lifter`)
  if (profile.weight) who.push(`bodyweight ${profile.weight} lbs`)
  if (profile.height) who.push(profile.height)
  if (profile.goal) who.push(`goal: ${profile.goal}`)
  if (profile.horizon) who.push(`horizon: ${profile.horizon}${horizonEnd ? ` (ends ${fmtDate(horizonEnd.toISOString())})` : ''}`)
  if (who.length) text += `ABOUT ME: ${who.join(' · ')}\n`

  const exCount = new Set(days.flatMap(dk => routine[dk].exercises.map(e => e.id))).size
  const targetStr = series
    .filter(s => s.target)
    .map(s => `${s.name} ${s.target}`)
    .join(' · ')
  text += `PROGRAM: ${days.length}-day ${profile.split ?? 'split'} · ${exCount} exercises`
  if (targetStr) text += ` · targets (est. 1RM): ${targetStr}`
  text += '\n\n'

  text += 'HOW TO READ THIS:\n'
  text += '• Sessions = completed / planned training days that week. Tonnage = total lbs lifted (weight × reps).\n'
  text += '• Est. 1RM = Epley estimate from the best set of the week. Day0 = my baseline test. Targets are goal est. 1RMs.\n'
  text += '• ETA = straight-line projection of the current trend to the target; "on track" / "behind" is vs my horizon.\n'
  text += '• Notes are my own comments logged on specific exercises (pain, form, equipment, how it felt).\n\n'

  text += 'WEEK BY WEEK\n'
  text += '════════════════════════════════════════\n'
  text += `${'Wk'.padEnd(5)}${'Sessions'.padEnd(11)}${'Tonnage'.padEnd(12)}Sets\n`
  for (const w of weeks) {
    const sessions = w.started === 0 ? '—' : `${w.completed}/${w.planned}`
    text += `${String(w.week).padStart(2, '0').padEnd(5)}${sessions.padEnd(11)}${(w.started ? fmtInt(w.tonnage) : '—').padEnd(12)}${w.started ? w.sets : '—'}\n`
  }
  text += `Current streak: ${streak} complete week${streak === 1 ? '' : 's'}.\n\n`

  text += 'EXERCISE TRENDS (est. 1RM, lbs)\n'
  text += '════════════════════════════════════════\n'
  for (const s of series) {
    const head = s.target
      ? `target ${s.target} · now ${s.current ?? '—'}${s.pct !== null ? ` (${s.pct}%)` : ''}`
      : `now ${s.current ?? '—'} · no target`
    text += `${s.name.padEnd(28)} ${head}\n`
    const pts: string[] = []
    if (s.day0) pts.push(`Day0 ${s.day0}`)
    for (const p of s.points) pts.push(`W${p.week} ${p.est1rm} (${p.weight}×${p.reps})`)
    text += `  ${pts.length ? pts.join(' → ') : 'not logged yet'}\n`
    if (s.target) text += `  ${etaLine(s.eta, horizonEnd)}\n`
  }
  text += '\n'

  text += 'NOTES\n'
  text += '════════════════════════════════════════\n'
  if (notes.length) {
    for (const n of notes) text += `W${n.week} D${n.day} · ${n.name}: ${n.note.replace(/\s*\n+\s*/g, ' / ')}\n`
  } else {
    text += '(none)\n'
  }
  text += '\n'

  text += 'WHAT I WANT BACK\n'
  text += '════════════════════════════════════════\n'
  text += '1. Assess the block: where I am progressing, where I have stalled or regressed, and whether the trends support my targets on my horizon.\n'
  text += '2. Recommend block-level changes — exercise swaps, volume/intensity, rep ranges, a deload if warranted — and say why.\n'
  text += `3. Prescribe week ${nextWeek}.\n\n`

  const currentRoutine: Routine = Object.fromEntries(
    days.map((dk, i) => [
      dk,
      {
        ...routine[dk],
        exercises: routine[dk].exercises.map(ex => ({
          ...ex,
          qual: ex.qual ?? '',
          weight: ex.unit === 'BW' ? 0 : (prescribed[i + 1]?.[ex.id] ?? ex.weight),
        })),
      },
    ])
  )
  text += '────────────────────────────────────────\n'
  text += 'THEN, so I can load your changes back into my app:\n'
  text += `Below is my current program as JSON, with each exercise's "weight" set to what week ${nextWeek} currently prescribes. `
  text += `Return my UPDATED program for week ${nextWeek} as ONE json code block (fenced with triple backticks) in the exact same shape `
  text += '(a "routine" object of days → { name, meta, exercises[] }, each exercise having id, name, qual, sets, reps, weight, unit, progKey; '
  text += 'plus a "targets" object of exercise id → goal 1RM in lbs).\n'
  text += 'RULES: Keep every day key and every exercise "id" identical to below — that is what keeps my logged history and progression linked. '
  text += 'If you swap a movement, reuse the same id in that slot. Do not invent new ids, rename keys, or drop the JSON block.\n\n'
  text += `MY CURRENT PROGRAM (week ${nextWeek} weights):\n`
  text += '```json\n'
  text += JSON.stringify({ routine: currentRoutine, targets }, null, 2) + '\n'
  text += '```\n'
  return text
}
