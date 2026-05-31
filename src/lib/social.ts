import { calc1RM } from './epley'
import { normalizeRoutine, normalizeTargets } from './routine'
import type { Routine } from './routine'

// ---------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------
export interface Profile {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_public: boolean
  share_stats: boolean
  shares_routine: boolean
  lift_stats: LiftStats
  shared_routine: Routine | null
  shared_targets: Record<string, number> | null
  created_at: string
  updated_at: string
}

export type LiftStats = Record<string, { name: string; est1rm: number; unit: 'lbs' | 'BW' }>

// ---------------------------------------------------------------
// Friendships — one canonical row per pair, user_a < user_b
// ---------------------------------------------------------------
export type FriendStatus = 'pending' | 'accepted'

export interface Friendship {
  user_a: string
  user_b: string
  status: FriendStatus
  requested_by: string
  created_at: string
  accepted_at: string | null
}

// Canonical ordering so a pair maps to exactly one row.
export function friendPair(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a }
}

// Relationship of the viewer to another user, derived from a friendship row.
export type FriendRel =
  | 'none' // no row
  | 'friends' // accepted
  | 'outgoing' // pending, viewer sent it
  | 'incoming' // pending, other sent it

export function friendRel(row: Friendship | null | undefined, viewerId: string): FriendRel {
  if (!row) return 'none'
  if (row.status === 'accepted') return 'friends'
  return row.requested_by === viewerId ? 'outgoing' : 'incoming'
}

// ---------------------------------------------------------------
// Activities
// ---------------------------------------------------------------
export type ActivityType =
  | 'workout_completed'
  | 'week_completed'
  | 'pr_set'
  | 'program_forked'
  | 'joined'

export type ActivityVisibility = 'friends' | 'public'

export interface Activity {
  id: string
  actor_id: string
  type: ActivityType
  payload: Record<string, unknown>
  visibility: ActivityVisibility
  created_at: string
}

export interface Comment {
  id: string
  activity_id: string
  author_id: string
  body: string
  created_at: string
}

// ---------------------------------------------------------------
// Lift-stats snapshot builder.
// Generalizes the dashboard's best-1RM-per-exercise logic so a user
// can publish a stale, curated snapshot WITHOUT exposing their raw
// workout_logs. Only exercises present in the routine are included
// (so the snapshot carries display names + units, never private notes).
// ---------------------------------------------------------------
type SetEntry = { weight: string; reps: string }
type ExLog = Record<string, { sets: SetEntry[] }>

export function buildLiftStats(
  routine: Routine | null,
  logs: { exercises: ExLog }[]
): LiftStats {
  if (!routine) return {}
  const stats: LiftStats = {}
  for (const day of Object.values(routine)) {
    for (const ex of day.exercises) {
      if (ex.unit === 'BW') continue // bodyweight lifts have no meaningful 1RM
      if (stats[ex.id]) continue
      let best: number | null = null
      for (const log of logs) {
        for (const s of log.exercises?.[ex.id]?.sets ?? []) {
          const est = calc1RM(parseFloat(s.weight), parseInt(s.reps))
          if (est && (!best || est > best)) best = est
        }
      }
      if (best) stats[ex.id] = { name: ex.name, est1rm: Math.round(best), unit: ex.unit }
    }
  }
  return stats
}

// Validate a shared snapshot before copying it into the forker's program.
// Reuses the same coercion the import flow uses on Claude's JSON.
export function normalizeRoutineForFork(
  rawRoutine: unknown,
  rawTargets: unknown
): { routine: Routine | null; targets: Record<string, number>; dayCount: number } {
  const routine = normalizeRoutine(rawRoutine)
  const targets = normalizeTargets(rawTargets)
  return { routine, targets, dayCount: routine ? Object.keys(routine).length : 0 }
}

// Human label for an activity, built purely from its snapshot payload.
export function activityHeadline(a: Activity): string {
  const p = a.payload as Record<string, string | number>
  switch (a.type) {
    case 'workout_completed':
      return `Completed ${p.dayName ?? 'a workout'} — Week ${p.week}, Day ${p.day}`
    case 'week_completed':
      return `Finished Week ${p.week} (${p.sessions ?? 0} sessions)`
    case 'pr_set':
      return `New PR: ${p.exName} — ${p.est1rm} ${p.unit ?? 'lbs'} est. 1RM`
    case 'program_forked':
      return `Forked @${p.sourceUsername}'s program (${p.dayCount ?? 0} days)`
    case 'joined':
      return `Joined the gym floor`
    default:
      return 'Did something'
  }
}
