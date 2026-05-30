import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ROUTINE } from '@/lib/routine'
import { WorkoutLogClient } from './client'
import type { Routine } from '@/lib/routine'

export const dynamic = 'force-dynamic'

export default async function LogPage({
  params,
}: {
  params: Promise<{ week: string; day: string }>
}) {
  const { week, day } = await params
  const weekNum = Math.max(1, parseInt(week) || 1)
  const dayNum = Math.min(4, Math.max(1, parseInt(day) || 1))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: prog } = await supabase
    .from('programs')
    .select('id, routine')
    .eq('user_id', user.id)
    .single()

  const routine: Routine = prog?.routine ?? DEFAULT_ROUTINE
  const programId: string | null = prog?.id ?? null

  const { data: existingLog } = await supabase
    .from('workout_logs')
    .select('exercises')
    .eq('user_id', user.id)
    .eq('week_num', weekNum)
    .eq('day_num', dayNum)
    .maybeSingle()

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
      existingExercises={existingLog?.exercises ?? null}
      priorExercises={priorLog?.exercises ?? null}
    />
  )
}
