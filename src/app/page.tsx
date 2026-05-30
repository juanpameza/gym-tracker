import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ROUTINE } from '@/lib/routine'
import type { Routine } from '@/lib/routine'

export const dynamic = 'force-dynamic'

async function signOut() {
  'use server'
  const { createClient: makeClient } = await import('@/lib/supabase/server')
  const supabase = await makeClient()
  await supabase.auth.signOut()
}

export default async function Dashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: prog } = await supabase
    .from('programs')
    .select('id, routine, profile')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: day0 } = await supabase
    .from('day0_results')
    .select('id, completed_at')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: logs } = await supabase
    .from('workout_logs')
    .select('week_num, day_num, logged_at')
    .eq('user_id', user.id)
    .order('week_num', { ascending: false })
    .order('day_num', { ascending: false })
    .limit(20)

  const routine: Routine = prog?.routine ?? DEFAULT_ROUTINE
  const dayKeys = Object.keys(routine)

  const latestWeek = logs?.[0]?.week_num ?? 1
  const thisWeekLogs = (logs ?? []).filter(l => l.week_num === latestWeek)
  const loggedDays = new Set(thisWeekLogs.map(l => l.day_num))
  const totalSessions = logs?.length ?? 0

  const started = day0?.completed_at
    ? new Date(day0.completed_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toUpperCase()
    : null

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
            ★ 6-MONTH PROGRAM ★
          </div>
          <h1 className="font-display font-black leading-none text-5xl">
            WEEK <span className="text-[#d9a441] italic">{latestWeek}.</span>
          </h1>
          <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-4 border-t border-dashed border-[#2a2a25] pt-4 flex justify-between flex-wrap gap-2">
            <span>JP / 180 LBS / PPL+ 4-DAY</span>
            {started && <span>STARTED {started}</span>}
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-7">
          <StatBox label="Sessions" value={String(totalSessions)} />
          <StatBox label="Current Week" value={String(latestWeek)} />
          <StatBox label="Day 0" value={day0 ? '✓' : '—'} accent={!!day0} />
        </div>

        {/* Day 0 CTA */}
        {!day0 && (
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

        {/* This week */}
        <div className="mb-7">
          <div className="text-[10px] tracking-[0.25em] text-[#6b6a62] uppercase mb-3">
            Week {latestWeek} — Today&apos;s Log
          </div>
          <div className="grid grid-cols-2 gap-3">
            {dayKeys.map((dk, i) => {
              const dn = i + 1
              const done = loggedDays.has(dn)
              return (
                <Link
                  key={dk}
                  href={`/log/${latestWeek}/${dn}`}
                  className={`border p-4 transition-all ${
                    done
                      ? 'border-[#4a9b5e] bg-[rgba(74,155,94,0.05)]'
                      : 'border-[#2a2a25] hover:border-[#d9a441]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display text-3xl font-black leading-none">{dn}</span>
                    {done && <span className="text-[#4a9b5e] text-sm">✓</span>}
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
            href="/intake"
            className="flex items-center justify-between border border-[#2a2a25] hover:border-[#f4ede0] p-4 transition-colors group"
          >
            <span className="text-[13px] font-bold">Update Program / Intake</span>
            <span className="text-[#6b6a62] group-hover:text-[#f4ede0] text-xs tracking-widest">→</span>
          </Link>
        </div>

        {/* Sign out */}
        <form action={signOut}>
          <button
            type="submit"
            className="text-[10px] text-[#6b6a62] hover:text-[#f4ede0] tracking-[0.2em] uppercase transition-colors cursor-pointer"
          >
            Sign out ↗
          </button>
        </form>

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">
          // GYM TRACKER v1 //
        </footer>
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="border border-[#2a2a25] p-3 text-center">
      <div
        className={`font-display text-3xl font-black leading-none ${
          accent ? 'text-[#4a9b5e]' : 'text-[#d9a441]'
        }`}
      >
        {value}
      </div>
      <div className="text-[9px] tracking-[0.2em] text-[#6b6a62] uppercase mt-1.5">{label}</div>
    </div>
  )
}
