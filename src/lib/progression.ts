export type ProgKey =
  | 'compound-upper'
  | 'compound-upper-small'
  | 'compound-lower'
  | 'accessory'
  | 'isolation'
  | 'bodyweight'

// RPE is logged per set on a 7–10 scale (null = not recorded).
export type RPE = 7 | 8 | 9 | 10 | null
export const RPE_VALUES: Exclude<RPE, null>[] = [7, 8, 9, 10]

export interface SetLog {
  weight: string
  reps: string
  rpe: RPE
}

// Older logs stored RPE as easy / perfect / hard. Everything read from the DB
// goes through this so the rest of the app only ever sees 7–10 | null.
const LEGACY_RPE: Record<string, RPE> = { easy: 7, perfect: 8, hard: 9 }

export function normalizeRPE(v: unknown): RPE {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string' && v in LEGACY_RPE) return LEGACY_RPE[v]
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return (RPE_VALUES as number[]).includes(n) ? (n as RPE) : null
}

// ── Progression rules (decided 2026-08-29; reference/known-bugs.md) ──────
//
//  0. Anchor on the weight you actually settled on (the last logged set's).
//     A set with reps but no weight was done at the prescribed weight.
//     Earlier LIGHTER sets are ignored (started light, bumped up). Earlier
//     HEAVIER sets (loaded heavy, then dropped) use the split rule:
//       heavier sets hit min reps AND anchor sets all at top → midpoint
//       otherwise                                            → hold at anchor
//  1. Any anchor set below the rep range              → DELOAD  anchor × 0.9
//  2. Not every anchor set at the top of the range    → HOLD    anchor
//  3. Every anchor set at the top of the range:
//     a. ≥ GRIND_MIN_SETS sets at RPE 10, or a fixed rep target with any
//        RPE 10 (no rep cushion to absorb the increment)  → HOLD
//     b. ≥ JUMP_MIN_EASY_SETS sets at RPE 7 and no set ≥ JUMP_VETO_RPE
//                                                          → JUMP  +2×inc
//     c. otherwise                                         → PROGRESS +inc
//  Unrecorded RPE is neutral (counts as 8). The verdict's direction is
//  relative to the anchor, not the prescription.
export const JUMP_MIN_EASY_SETS = 2
export const JUMP_VETO_RPE = 9
export const GRIND_MIN_SETS = 2
const RPE_EASY = 7
const RPE_MAX = 10

const INC: Record<ProgKey, number> = {
  'compound-upper': 5,
  'compound-upper-small': 2.5,
  'compound-lower': 10,
  accessory: 5,
  isolation: 2.5,
  bodyweight: 0,
}

function round25(n: number) {
  return Math.round(n / 2.5) * 2.5
}

function parseRepRange(reps: string): [number, number] {
  if (reps.includes('-')) {
    const parts = reps.split('-')
    return [parseInt(parts[0]), parseInt(parts[1])]
  }
  const n = parseInt(reps)
  return [n, n]
}

function repsOf(s: SetLog): number {
  return parseInt(s.reps) || 0
}

export type Direction = 'jump' | 'progress' | 'hold' | 'deload'

export interface Decision {
  direction: Direction
  anchor: number // the weight the decision is relative to — what was actually lifted
  next: number // next session's weight
}

export function decide(
  progKey: ProgKey,
  repRange: string,
  prescribed: number,
  unit: string,
  sets: SetLog[]
): Decision {
  if (unit === 'BW' || progKey === 'bodyweight') return { direction: 'hold', anchor: 0, next: 0 }

  const filled = sets
    .filter(s => s.reps !== '')
    .map(s => ({ ...s, w: s.weight !== '' ? parseFloat(s.weight) || prescribed : prescribed }))
  if (!filled.length) return { direction: 'hold', anchor: prescribed, next: prescribed }

  const inc = INC[progKey]
  const [minRep, maxRep] = parseRepRange(repRange)

  // 0. Anchor
  const anchor = filled[filled.length - 1].w
  const anchorSets = filled.filter(s => s.w === anchor)
  const heavier = filled.filter(s => s.w > anchor)
  const belowMin = anchorSets.some(s => repsOf(s) < minRep)
  const atTop = anchorSets.every(s => repsOf(s) >= maxRep)

  if (heavier.length) {
    if (belowMin) return { direction: 'deload', anchor, next: round25(anchor * 0.9) }
    const heavyHit = heavier.every(s => repsOf(s) >= minRep)
    if (heavyHit && atTop) {
      const heavyW = Math.max(...heavier.map(s => s.w))
      return { direction: 'progress', anchor, next: round25((heavyW + anchor) / 2) }
    }
    return { direction: 'hold', anchor, next: anchor }
  }

  // 1. Under the range
  if (belowMin) return { direction: 'deload', anchor, next: round25(anchor * 0.9) }
  // 2. In the range, not at the top
  if (!atTop) return { direction: 'hold', anchor, next: anchor }

  // 3. At the top of the range
  const tens = anchorSets.filter(s => s.rpe === RPE_MAX).length
  const sevens = anchorSets.filter(s => s.rpe === RPE_EASY).length
  const vetoed = anchorSets.some(s => s.rpe !== null && s.rpe >= JUMP_VETO_RPE)
  const fixedReps = minRep === maxRep
  if (tens >= GRIND_MIN_SETS || (fixedReps && tens > 0)) return { direction: 'hold', anchor, next: anchor }
  if (sevens >= JUMP_MIN_EASY_SETS && !vetoed) return { direction: 'jump', anchor, next: round25(anchor + inc * 2) }
  return { direction: 'progress', anchor, next: round25(anchor + inc) }
}

export function nextWeight(
  progKey: ProgKey,
  repRange: string,
  currentWeight: number,
  unit: string,
  sets: SetLog[]
): number {
  return decide(progKey, repRange, currentWeight, unit, sets).next
}

export interface Verdict {
  direction: 'up' | 'hold' | 'down'
  decision: Direction
  anchor: number
  nextW: number
  label: string
}

const LABELS: Record<Direction, string> = {
  jump: '↑↑ JUMP',
  progress: '↑ PROGRESS',
  hold: '→ HOLD',
  deload: '↓ DELOAD',
}

export function verdict(
  progKey: ProgKey,
  repRange: string,
  prescribed: number,
  unit: string,
  sets: SetLog[],
  numSets: number
): Verdict | null {
  if (unit === 'BW') {
    return { direction: 'hold', decision: 'hold', anchor: 0, nextW: 0, label: '→ MAINTAIN BODYWEIGHT' }
  }

  const filled = sets.filter(s => s.reps !== '')
  if (filled.length < numSets) return null

  const d = decide(progKey, repRange, prescribed, unit, sets)
  const direction = d.direction === 'hold' ? 'hold' : d.direction === 'deload' ? 'down' : 'up'
  return { direction, decision: d.direction, anchor: d.anchor, nextW: d.next, label: LABELS[d.direction] }
}

// Tap-to-cycle: — → 7 → 8 → 9 → 10 → —
export function cycleRPE(current: RPE): RPE {
  if (current === null) return RPE_VALUES[0]
  const i = RPE_VALUES.indexOf(current)
  return i === -1 || i === RPE_VALUES.length - 1 ? null : RPE_VALUES[i + 1]
}
