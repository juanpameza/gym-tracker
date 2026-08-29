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

// ---------------------------------------------------------------
// Routine / targets validation. Shared by the import page (parsing
// Claude's response) and the fork flow (validating a shared snapshot
// before copying it into the forker's program).
// ---------------------------------------------------------------

export interface ParsedProgram {
  routine?: Routine | null
  targets?: Record<string, number>
}

export function normalizeRoutine(raw: unknown): Routine | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Routine = {}
  for (const [dayKey, dayVal] of Object.entries(raw as Record<string, unknown>)) {
    if (!dayVal || typeof dayVal !== 'object') continue
    const d = dayVal as Record<string, unknown>
    const exRaw = Array.isArray(d.exercises) ? d.exercises : []
    const exercises: Exercise[] = []
    for (const e of exRaw) {
      if (!e || typeof e !== 'object') continue
      const ex = e as Record<string, unknown>
      const id = typeof ex.id === 'string' ? ex.id.trim() : ''
      const name = typeof ex.name === 'string' ? ex.name.trim() : ''
      if (!id || !name) continue
      const unit: Exercise['unit'] = UNITS.includes(ex.unit as Exercise['unit'])
        ? (ex.unit as Exercise['unit'])
        : 'lbs'
      const progKey: ProgKey = PROG_KEYS.includes(ex.progKey as ProgKey)
        ? (ex.progKey as ProgKey)
        : unit === 'BW'
          ? 'bodyweight'
          : 'isolation'
      const sets = Math.max(1, Math.round(Number(ex.sets) || 3))
      const reps = typeof ex.reps === 'string' && ex.reps.trim() ? ex.reps.trim() : '8-10'
      const weight = unit === 'BW' ? 0 : Math.max(0, Number(ex.weight) || 0)
      const qual = typeof ex.qual === 'string' && ex.qual.trim() ? ex.qual.trim() : undefined
      exercises.push({ id, name, qual, sets, reps, weight, unit, progKey })
    }
    if (!exercises.length) continue
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : dayKey
    const meta = typeof d.meta === 'string' ? d.meta.trim() : ''
    out[dayKey] = { name, meta, exercises }
  }
  return Object.keys(out).length ? out : null
}

export function normalizeTargets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) out[k] = Math.round(n)
  }
  return out
}

function isProgramObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && ('routine' in v || 'targets' in v)
}

export function extractJson(text: string): ParsedProgram | null {
  // Every ```-delimited segment is a candidate, tried last-first: Claude may
  // show an example block before the real one, and a stray fence in prose
  // must not swallow the block that follows it. No fences → the whole text.
  const segments = text.split('```').map(s => s.replace(/^\s*json\b/i, '').trim())
  let parsed: unknown = null
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i]) continue
    try {
      const candidate = JSON.parse(segments[i])
      if (isProgramObject(candidate)) {
        parsed = candidate
        break
      }
    } catch {
      /* not this segment — keep looking */
    }
  }
  if (!parsed) {
    const objMatch = text.match(/\{[\s\S]*"(?:routine|targets)"[\s\S]*\}/)
    if (objMatch) {
      try {
        parsed = JSON.parse(objMatch[0])
      } catch {
        return null
      }
    }
  }
  if (!isProgramObject(parsed)) return null
  const obj = parsed
  return {
    routine: normalizeRoutine(obj.routine),
    targets: normalizeTargets(obj.targets),
  }
}
