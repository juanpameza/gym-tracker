import type { ProgKey } from './progression'

export interface Exercise {
  id: string
  name: string
  qual?: string
  sets: number
  reps: string
  weight: number
  unit: 'lbs' | 'BW'
  progKey: ProgKey
}

export interface DayRoutine {
  name: string
  meta: string
  exercises: Exercise[]
}

export type Routine = Record<string, DayRoutine>

// Valid enum values — used to validate the routine Claude returns on import.
export const PROG_KEYS: ProgKey[] = [
  'compound-upper',
  'compound-upper-small',
  'compound-lower',
  'accessory',
  'isolation',
  'bodyweight',
]

export const UNITS: Exercise['unit'][] = ['lbs', 'BW']

// Lifts a routine exercise's rep-range string down to its lower bound (e.g. "6-8" → 6),
// used as the baseline-test rep target when deriving Day 0 from the routine.
export function repTarget(reps: string): number {
  const n = parseInt(reps)
  return Number.isFinite(n) && n > 0 ? n : 5
}
