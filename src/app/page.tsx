import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Routine } from '@/lib/routine'
import { calc1RM } from '@/lib/epley'
import StatBox from '@/components/StatBox'

export const dynamic = 'force-dynamic'

type SetEntry = { weight: string; reps: string }
type ExLog = Record<string, { sets: SetEntry[] }>

// Best estimated 1RM for a single exercise id across recent logs.
function best1RM(logs: { exercises: ExLog }[], exId: string): number | null {
  let best: number | null = null
  for (const log of logs) {
    for (const s of log.exercises?.[exId]?.sets ?? []) {
      const w = parseFloat(s.weight)
      const r = parseInt(s.reps)
      const est = calc1RM(w, r)
      if (est && (!best || est > best)) best = est
    }
  }
  return best ? Math.round(best) : null
}

// Find an exercise's display name from the routine by its id.
function exerciseName(routine: Routine | null, exId: string): string {
  if (routine) {
    for (const day of Object.values(routine)) {
      const ex = day.exercises.find(e => e.id === exId)
      if (ex) return ex.name
    }
  }
  return exId.toUpperCase()
}

export default async function Dashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: prog } = await supabase
    .from('programs')
    .select('id, routine, profile, targets, forked_from_username')
    .eq('user_id', user.id)
    .maybeSingle()

  const [{ data: day0 }, { data: logs }, { data: progLogs }] = await Promise.all([
    supabase
      .from('day0_results')
      .select('id, completed_at')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workout_logs')
      .select('week_num, day_num, logged_at')
      .eq('user_id', user.id)
      .order('week_num', { ascending: false })
      .order('day_num', { ascending: false })
      .limit(20),
    supabase
      .from('workout_logs')
      .select('exercises')
      .eq('user_id', user.id)
      .order('week_num', { ascending: false })
      .order('day_num', { ascending: false })
      .limit(8),
  ])

  const routine: Routine | null = prog?.routine ?? null
  const dayKeys = routine ? Object.keys(routine) : []

  const latestWeek = logs?.[0]?.week_num ?? 1
  const thisWeekLogs = (logs ?? []).filter(l => l.week_num === latestWeek)
  const loggedDays = new Set(thisWeekLogs.map(l => l.day_num))
  const totalSessions = logs?.length ?? 0
  const isEstablished = totalSessions > 0
  const hasRoutine = dayKeys.length > 0

  const started = day0?.completed_at
    ? new Date(day0.completed_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toUpperCase()
    : null

  const profile = (prog?.profile ?? {}) as Record<string, string>
  const targets = (prog?.targets ?? {}) as Record<string, number>
  const weightLabel = profile.weight ? `${profile.weight} LBS` : null
  const splitLabel = profile.split ?? null
  const forkedFrom = (prog?.forked_from_username ?? null) as string | null
  // A forked routine with no intake profile yet — nudge the user to personalize.
  const needsProfile = hasRoutine && Object.keys(profile).length === 0

  // Next unfinished workout
  const nextDayIdx = dayKeys.findIndex((_, i) => !loggedDays.has(i + 1))
  const allDoneThisWeek = nextDayIdx === -1
  const nextWeek = allDoneThisWeek ? latestWeek + 1 : latestWeek
  const nextDay = allDoneThisWeek ? 1 : nextDayIdx + 1
  const nextDayKey = allDoneThisWeek ? dayKeys[0] : dayKeys[nextDayIdx]

  // Strength progress items — derived from the user's own targets (keyed by exercise id)
  const typedProgLogs = (progLogs ?? []) as { exercises: ExLog }[]
  const progressItems = isEstablished
    ? Object.entries(targets).flatMap(([exId, target]) => {
        if (!target) return []
        const current = best1RM(typedProgLogs, exId)
        if (!current) return []
        return [{
          key: exId,
          label: exerciseName(routine, exId).toUpperCase(),
          current,
          target,
          pct: Math.min(Math.round((current / target) * 100), 100),
        }]
      })
    : []

  return (
    <div
      className="min-h-screen px-4 py-8 pb-20"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">
            DASHBOARD
          </div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">
            {hasRoutine
              ? `★ ${profile.horizon ? `${profile.horizon.toUpperCase()} PROGRAM` : 'TRAINING PROGRAM'} ★`
              : '★ NEW ATHLETE ★'}
          </div>
          <h1 className="font-display font-black leading-none text-5xl">
            {hasRoutine ? (
              <>WEEK <span className="text-[#d9a441] italic">{latestWeek}.</span></>
            ) : (
              <>WELCOME<span className="text-[#d9a441] italic">.</span></>
            )}
          </h1>
          <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-4 border-t border-dashed border-[#2a2a25] pt-4 flex justify-between flex-wrap gap-2">
            <span>{[weightLabel, splitLabel].filter(Boolean).join(' / ') || (forkedFrom ? `FORKED FROM @${forkedFrom}` : prog ? 'YOUR PROGRAM' : 'NO PROGRAM YET')}</span>
            {started && <span>SINCE {started}</span>}
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-7">
          <StatBox label="Sessions" value={String(totalSessions)} />
          <StatBox label="This Week" value={dayKeys.length ? `${loggedDays.size}/${dayKeys.length}` : '—'} />
          <StatBox label="Day 0" value={day0 ? '✓' : '—'} accent={!!day0} />
        </div>

        {/* Personalize a forked/bootstrapped routine */}
        {needsProfile && (
          <div className="border border-[#d9a441] bg-[rgba(217,164,65,0.05)] p-5 mb-5">
            <p className="text-[11px] tracking-[0.2em] text-[#d9a441] uppercase font-bold mb-2">
              Make it yours
            </p>
            <p className="text-[13px] text-[#f4ede0] mb-4">
              {forkedFrom
                ? <>You&apos;re training on @{forkedFrom}&apos;s routine. Add your profile so Claude can personalize your progression.</>
                : <>Add your profile so Claude can personalize your progression.</>}
            </p>
            <Link
              href="/intake"
              className="inline-block bg-[#d9a441] text-[#1a1a17] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-5 hover:bg-[#f4ede0] transition-colors"
            >
              ▸ ADD YOUR PROFILE
            </Link>
          </div>
        )}

        {/* No program yet */}
        {!prog && (
          <div className="border border-[#c8311a] bg-[rgba(200,49,26,0.05)] p-5 mb-5">
            <p className="text-[11px] tracking-[0.2em] text-[#c8311a] uppercase font-bold mb-2">
              Get started
            </p>
            <p className="text-[13px] text-[#f4ede0] mb-4">
              Complete the intake form so Claude can build your personalized program.
            </p>
            <Link
              href="/intake"
              className="inline-block bg-[#c8311a] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-5 hover:bg-[#d9a441] hover:text-[#1a1a17] transition-colors"
            >
              ▸ COMPLETE INTAKE
            </Link>
          </div>
        )}

        {/* Day 0 CTA */}
        {prog && !day0 && (
          <div className="border border-[#d9a441] bg-[rgba(217,164,65,0.05)] p-5 mb-5">
            <p className="text-[11px] tracking-[0.2em] text-[#d9a441] uppercase font-bold mb-2">
              Action required
            </p>
            <p className="text-[13px] text-[#f4ede0] mb-4">
              Complete your Day 0 baseline test before starting weekly logs.
            </p>
            <Link
              href="/day0"
              className="inline-block bg-[#d9a441] text-[#1a1a17] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-5 hover:bg-[#f4ede0] transition-colors"
            >
              ▸ DO DAY 0 TEST
            </Link>
          </div>
        )}

        {/* Ready to start CTA (day0 done, no logs yet) */}
        {day0 && !isEstablished && (
          <div className="border border-[#4a9b5e] bg-[rgba(74,155,94,0.05)] p-5 mb-5">
            <p className="text-[11px] tracking-[0.2em] text-[#4a9b5e] uppercase font-bold mb-2">
              Ready to go
            </p>
            <p className="text-[13px] text-[#f4ede0] mb-4">
              Day 0 baseline complete. Time to start Week 1.
            </p>
            <Link
              href="/log/1/1"
              className="inline-block bg-[#4a9b5e] text-[#0e0e0c] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-5 hover:bg-[#f4ede0] transition-colors"
            >
              ▸ START WEEK 1 · DAY 1
            </Link>
          </div>
        )}

        {/* Next workout CTA (established users) */}
        {isEstablished && (
          <Link
            href={`/log/${nextWeek}/${nextDay}`}
            className="flex items-center justify-between bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] p-5 mb-7 transition-all group"
          >
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase mb-1 opacity-70">
                {allDoneThisWeek ? `WEEK ${nextWeek}` : `WEEK ${latestWeek}`} · DAY {nextDay}
              </div>
              <div className="font-display font-black text-2xl leading-none">
                {routine?.[nextDayKey]?.name ?? 'NEXT SESSION'}
              </div>
              <div className="text-[11px] tracking-[0.1em] mt-1 opacity-70">
                {routine?.[nextDayKey]?.meta}
              </div>
            </div>
            <span className="font-display text-3xl font-black group-hover:translate-x-1 transition-transform">
              →
            </span>
          </Link>
        )}

        {/* Strength progress toward goals */}
        {progressItems.length > 0 && (
          <div className="mb-7">
            <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-4">
              // Strength Progress //
            </div>
            <div className="space-y-4">
              {progressItems.map(item => (
                <div key={item.key}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-[11px] font-bold tracking-[0.15em]">{item.label}</span>
                    <span className="text-[11px] text-[#6b6a62] tracking-[0.08em]">
                      <span className="text-[#f4ede0] font-bold">{item.current}</span>
                      {' → '}
                      {item.target} LBS EST. 1RM
                    </span>
                  </div>
                  <div className="h-[3px] bg-[#2a2a25] w-full">
                    <div
                      className="h-full bg-[#d9a441] transition-all"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                  <div className="text-right text-[9px] tracking-[0.1em] text-[#6b6a62] mt-0.5">
                    {item.pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* This week's days */}
        {routine && (
        <div className="mb-7">
          <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3">
            Week {latestWeek} —{' '}
            {loggedDays.size === dayKeys.length
              ? 'COMPLETE ✓'
              : `${dayKeys.length - loggedDays.size} day${dayKeys.length - loggedDays.size !== 1 ? 's' : ''} remaining`}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {dayKeys.map((dk, i) => {
              const dn = i + 1
              const done = loggedDays.has(dn)
              const isNext = !allDoneThisWeek && dn === nextDay
              return (
                <Link
                  key={dk}
                  href={`/log/${latestWeek}/${dn}`}
                  className={`border p-4 transition-all ${
                    done
                      ? 'border-[#4a9b5e] bg-[rgba(74,155,94,0.05)]'
                      : isNext
                        ? 'border-[#d9a441] bg-[rgba(217,164,65,0.04)]'
                        : 'border-[#2a2a25] hover:border-[#d9a441]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display text-3xl font-black leading-none">{dn}</span>
                    {done ? (
                      <span className="text-[#4a9b5e] text-sm">✓</span>
                    ) : isNext ? (
                      <span className="text-[#d9a441] text-[9px] tracking-widest">NEXT</span>
                    ) : null}
                  </div>
                  <div className="font-bold text-[13px] tracking-wide">{routine[dk].name}</div>
                  <div className="text-[10px] text-[#6b6a62] tracking-[0.1em] mt-0.5">
                    {routine[dk].meta}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
        )}

        {/* Quick links */}
        <div className="space-y-2 mb-8">
          <Link
            href="/day0"
            className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group"
          >
            <span className="text-[13px] font-bold">Day 0 Baseline Test</span>
            <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
          </Link>
          <Link
            href="/import"
            className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group"
          >
            <span className="text-[13px] font-bold">Import Claude&apos;s Program</span>
            <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
          </Link>
          <Link
            href="/intake"
            className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group"
          >
            <span className="text-[13px] font-bold">Update Intake / Re-run Program</span>
            <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
          </Link>
        </div>

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">
          // GYM TRACKER v1 //
        </footer>
      </div>
    </div>
  )
}
