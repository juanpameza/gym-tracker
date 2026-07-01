import { createClient } from '@/lib/supabase/server'
import { WorkoutLogClient, type ExercisesMap } from './client'
import type { Routine } from '@/lib/routine'

export const dynamic = 'force-dynamic'

export default async function LogPage({
  params,
}: {
  params: Promise<{ week: string; day: string }>
}) {
  const { week, day } = await params
  const weekNum = Math.max(1, parseInt(week) || 1)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: prog } = await supabase
    .from('programs')
    .select('id, routine, profile')
    .eq('user_id', user.id)
    .single()

  const routine: Routine = (prog?.routine as Routine) ?? {}
  const programId: string | null = prog?.id ?? null
  const profile = (prog?.profile ?? {}) as Record<string, string>

  // Clamp the day to the routine's actual day count (no fixed 4-day assumption).
  const dayCount = Math.max(1, Object.keys(routine).length)
  const dayNum = Math.min(dayCount, Math.max(1, parseInt(day) || 1))

  // Every logged day for this week — powers the full-week export. Keyed by day_num.
  const { data: weekLogs } = await supabase
    .from('workout_logs')
    .select('exercises, day_num')
    .eq('user_id', user.id)
    .eq('week_num', weekNum)

  const weekExercises: Record<number, ExercisesMap> = {}
  for (const log of weekLogs ?? []) {
    if (log.exercises) weekExercises[log.day_num] = log.exercises as ExercisesMap
  }
  const existingLog = { exercises: weekExercises[dayNum] ?? null }

  const { data: priorLog } = await supabase
    .from('workout_logs')
    .select('exercises, week_num')
    .eq('user_id', user.id)
    .eq('day_num', dayNum)
    .lt('week_num', weekNum)
    .order('week_num', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <WorkoutLogClient
      weekNum={weekNum}
      dayNum={dayNum}
      routine={routine}
      programId={programId}
      userId={user.id}
      profile={profile}
      existingExercises={existingLog?.exercises ?? null}
      priorExercises={priorLog?.exercises ?? null}
      weekExercises={weekExercises}
    />
  )
}
