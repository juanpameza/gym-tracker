import { createClient } from '@/lib/supabase/server'
import { WorkoutLogClient } from './client'
import type { Routine } from '@/lib/routine'
import {
  normalizeExercises,
  prescribedForDay,
  type ExercisesMap,
  type PriorLog,
  type WeekPrescriptions,
} from '@/lib/logs'

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
    .select('id, routine, profile, targets, routine_updated_at')
    .eq('user_id', user.id)
    .single()

  const routine: Routine = (prog?.routine as Routine) ?? {}
  const programId: string | null = prog?.id ?? null
  const profile = (prog?.profile ?? {}) as Record<string, string>
  const targets = (prog?.targets ?? {}) as Record<string, number>
  const routineUpdatedAt = (prog?.routine_updated_at as string | null) ?? null

  // Clamp the day to the routine's actual day count (no fixed 4-day assumption).
  const dayKeys = Object.keys(routine)
  const dayCount = Math.max(1, dayKeys.length)
  const dayNum = Math.min(dayCount, Math.max(1, parseInt(day) || 1))

  // Every logged day of this week (full-week export + day-tab checkmarks), and
  // for EVERY day the most recent earlier log — that is what this week's
  // prescriptions are derived from, and the export needs all of them, not just
  // the day being viewed.
  const [{ data: weekLogs }, priorLogs] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('exercises, day_num')
      .eq('user_id', user.id)
      .eq('week_num', weekNum),
    Promise.all(
      dayKeys.map((_, i) =>
        supabase
          .from('workout_logs')
          .select('exercises, logged_at')
          .eq('user_id', user.id)
          .eq('day_num', i + 1)
          .lt('week_num', weekNum)
          .order('week_num', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    ),
  ])

  const weekExercises: Record<number, ExercisesMap> = {}
  for (const log of weekLogs ?? []) {
    if (log.exercises) weekExercises[log.day_num] = normalizeExercises(log.exercises)
  }

  const priorByDay: Record<number, PriorLog> = {}
  priorLogs.forEach(({ data }, i) => {
    if (data?.exercises) {
      priorByDay[i + 1] = {
        exercises: normalizeExercises(data.exercises),
        loggedAt: (data.logged_at as string | null) ?? null,
      }
    }
  })

  const prescribed: WeekPrescriptions = {}
  dayKeys.forEach((dk, i) => {
    prescribed[i + 1] = prescribedForDay(routine[dk], priorByDay[i + 1] ?? null, routineUpdatedAt)
  })

  return (
    <WorkoutLogClient
      weekNum={weekNum}
      dayNum={dayNum}
      routine={routine}
      programId={programId}
      userId={user.id}
      profile={profile}
      targets={targets}
      existingExercises={weekExercises[dayNum] ?? null}
      priorExercises={priorByDay[dayNum]?.exercises ?? null}
      weekExercises={weekExercises}
      prescribed={prescribed}
    />
  )
}
