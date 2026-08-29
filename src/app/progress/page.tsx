import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Routine } from '@/lib/routine'
import { nextWorkout } from '@/lib/logs'
import {
  normalizeLogs,
  weeklyStats,
  weekStreak,
  exerciseSeries,
  horizonEnd as computeHorizonEnd,
  notesDigest,
  prescriptionsForWeek,
  formatProgressExport,
  fmtDate,
  fmtInt,
  etaLine,
  type Day0Snapshot,
  type ProgressLogRow,
} from '@/lib/progress'
import StatBox from '@/components/StatBox'
import { WeekBars, TrendLine } from './charts'
import ExportButton from './export-button'

export const dynamic = 'force-dynamic'

const BG = {
  backgroundImage:
    'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)',
  backgroundAttachment: 'fixed' as const,
}

function fmtK(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : fmtInt(n)
}

export default async function ProgressPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: prog }, { data: day0Row }, { data: logRows }] = await Promise.all([
    supabase
      .from('programs')
      .select('id, routine, targets, profile, created_at, routine_updated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('day0_results')
      .select('results, completed_at')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workout_logs')
      .select('week_num, day_num, logged_at, exercises')
      .eq('user_id', user.id)
      .order('week_num', { ascending: true })
      .order('day_num', { ascending: true }),
  ])

  const routine: Routine = (prog?.routine as Routine) ?? {}
  const targets = (prog?.targets ?? {}) as Record<string, number>
  const profile = (prog?.profile ?? {}) as Record<string, string>
  const routineUpdatedAt = (prog?.routine_updated_at as string | null) ?? null
  const dayKeys = Object.keys(routine)
  const hasRoutine = dayKeys.length > 0

  const rows = (logRows ?? []) as ProgressLogRow[]
  const logs = normalizeLogs(rows)
  const now = new Date()
  const day0: Day0Snapshot | null = day0Row
    ? { completedAt: (day0Row.completed_at as string | null) ?? null, results: (day0Row.results ?? {}) as Day0Snapshot['results'] }
    : null
  const horizon = computeHorizonEnd(profile, day0?.completedAt ?? (prog?.created_at as string | null) ?? null, now)

  const weeks = weeklyStats(routine, logs)
  const streak = weekStreak(weeks)
  const series = exerciseSeries(routine, targets, day0, logs, { now, horizonEnd: horizon })
  const notes = notesDigest(routine, logs)
  const next = nextWorkout(routine, rows)
  const prescribed = prescriptionsForWeek(routine, logs, next.week, routineUpdatedAt)

  const trainedWeeks = weeks.filter(w => w.started > 0).length
  const totalSessions = weeks.reduce((a, w) => a + w.completed, 0)
  const totalTonnage = weeks.reduce((a, w) => a + w.tonnage, 0)
  const hasLogs = logs.length > 0

  const exportText = formatProgressExport({
    profile,
    routine,
    targets,
    weeks,
    series,
    notes,
    streak,
    nextWeek: next.week,
    prescribed,
    horizonEnd: horizon,
  })

  const withTarget = series.filter(s => s.target)
  const withoutTarget = series.filter(s => !s.target && s.points.length > 0)

  return (
    <div className="min-h-screen px-4 py-8 pb-24" style={BG}>
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">
            PROGRESS
          </div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">
            ★ {trainedWeeks} WEEK{trainedWeeks === 1 ? '' : 'S'} TRAINED ★
          </div>
          <h1 className="font-display font-black leading-none text-5xl">
            PROGRESS<span className="text-[#d9a441] italic">.</span>
          </h1>
          <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-4 border-t border-dashed border-[#2a2a25] pt-4 flex justify-between flex-wrap gap-2">
            <span>{profile.horizon ? `${profile.horizon} HORIZON` : 'TRAINING LOG'}</span>
            {horizon && <span>ENDS {fmtDate(horizon.toISOString()).toUpperCase()}</span>}
          </div>
        </header>

        {!hasRoutine || !hasLogs ? (
          <div className="border border-[#d9a441] bg-[rgba(217,164,65,0.05)] p-5 mb-5">
            <p className="text-[11px] tracking-[0.2em] text-[#d9a441] uppercase font-bold mb-2">Nothing to chart yet</p>
            <p className="text-[13px] text-[#f4ede0] mb-4">
              {hasRoutine ? 'Log your first session and the trends start here.' : 'Import your program, then log a session.'}
            </p>
            <Link
              href={hasRoutine ? '/log/1/1' : '/import'}
              className="inline-block bg-[#d9a441] text-[#1a1a17] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-5 hover:bg-[#f4ede0] transition-colors"
            >
              {hasRoutine ? '▸ LOG A SESSION' : '▸ IMPORT PROGRAM'}
            </Link>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-7">
              <StatBox label="Sessions" value={String(totalSessions)} />
              <StatBox label="Total lbs" value={fmtK(totalTonnage)} />
              <StatBox label="Week streak" value={String(streak)} accent={streak > 0} />
            </div>

            {/* Weekly sessions */}
            <section className="mb-7">
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase">{'// Sessions per week //'}</div>
                <div className="text-[9px] tracking-[0.15em] text-[#6b6a62] uppercase">of {dayKeys.length} planned</div>
              </div>
              <div className="border border-[#2a2a25] p-3">
                <WeekBars
                  items={weeks.map(w => ({
                    label: `W${w.week}`,
                    value: w.completed,
                    max: w.planned,
                    tone: w.completed >= w.planned ? 'green' : w.completed > 0 ? 'amber' : 'dim',
                  }))}
                  format={v => `${v}`}
                />
              </div>
            </section>

            {/* Weekly tonnage */}
            <section className="mb-7">
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase">{'// Tonnage per week //'}</div>
                <div className="text-[9px] tracking-[0.15em] text-[#6b6a62] uppercase">lbs lifted · weight × reps</div>
              </div>
              <div className="border border-[#2a2a25] p-3">
                <WeekBars items={weeks.map(w => ({ label: `W${w.week}`, value: w.tonnage }))} format={fmtK} />
              </div>
            </section>

            {/* Strength trends */}
            {(withTarget.length > 0 || withoutTarget.length > 0) && (
              <section className="mb-7">
                <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3">{'// Strength · est. 1RM //'}</div>
                <div className="space-y-3">
                  {[...withTarget, ...withoutTarget].map(s => {
                    const values = [...(s.day0 ? [s.day0] : []), ...s.points.map(p => p.est1rm)]
                    const labels = [...(s.day0 ? ['D0'] : []), ...s.points.map(p => `W${p.week}`)]
                    const status = s.eta?.status
                    const etaTone =
                      status === 'reached' || status === 'on-track'
                        ? 'text-[#4a9b5e]'
                        : status === 'behind'
                          ? 'text-[#d9a441]'
                          : status === 'stalled'
                            ? 'text-[#c8311a]'
                            : 'text-[#6b6a62]'
                    const gained = s.current !== null && s.day0 ? s.current - s.day0 : null
                    return (
                      <div key={s.id} className="border border-[#2a2a25] p-4">
                        <div className="flex justify-between items-baseline gap-3 mb-1">
                          <span className="font-display text-[17px] font-bold leading-tight">{s.name}</span>
                          <span className="text-[11px] text-[#6b6a62] tracking-[0.08em] whitespace-nowrap">
                            <span className="text-[#f4ede0] font-bold">{s.current ?? '—'}</span>
                            {s.target ? <> → {s.target} LBS</> : <> LBS</>}
                          </span>
                        </div>
                        {s.target && s.pct !== null && (
                          <div className="h-[3px] bg-[#2a2a25] w-full mb-2">
                            <div className="h-full bg-[#d9a441]" style={{ width: `${s.pct}%` }} />
                          </div>
                        )}
                        {values.length > 0 && (
                          <TrendLine values={values} labels={labels} target={s.target} baselineFirst={!!s.day0} />
                        )}
                        <div className="mt-2 pt-2 border-t border-dashed border-[#2a2a25] text-[10px] tracking-[0.05em] text-[#6b6a62] flex justify-between gap-3 flex-wrap">
                          <span>
                            {gained !== null ? (
                              <>
                                <span className={gained >= 0 ? 'text-[#4a9b5e]' : 'text-[#c8311a]'}>
                                  {gained >= 0 ? '+' : ''}
                                  {gained} lbs
                                </span>{' '}
                                since Day 0
                              </>
                            ) : s.best ? (
                              <>best {s.best} lbs</>
                            ) : null}
                          </span>
                          <span className={`uppercase tracking-[0.1em] ${etaTone}`}>{s.target ? etaLine(s.eta, horizon) : 'no target set'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Export */}
            <div className="border-2 border-[#f4ede0] p-5 mb-8 bg-[linear-gradient(180deg,rgba(217,164,65,0.04),transparent)]">
              <h2 className="font-display font-black text-xl mb-1">Block Review</h2>
              <p className="text-[12px] text-[#6b6a62] mb-4 leading-relaxed">
                Copies {trainedWeeks} week{trainedWeeks === 1 ? '' : 's'} of sessions, tonnage, 1RM trends, ETAs and your notes — plus the
                program JSON — for Claude to review the whole block and prescribe week {next.week}.
              </p>
              <ExportButton text={exportText} label="▸ EXPORT PROGRESS REPORT" />
            </div>
          </>
        )}

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">
          {'// PROGRESS //'}
        </footer>
      </div>
    </div>
  )
}
