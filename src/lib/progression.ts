export type ProgKey =
  | 'compound-upper'
  | 'compound-upper-small'
  | 'compound-lower'
  | 'accessory'
  | 'isolation'
  | 'bodyweight'

export type RPE = 'easy' | 'perfect' | 'hard' | null

export interface SetLog {
  weight: string
  reps: string
  rpe: RPE
}

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

export function nextWeight(
  progKey: ProgKey,
  repRange: string,
  currentWeight: number,
  unit: string,
  sets: SetLog[]
): number {
  if (unit === 'BW' || progKey === 'bodyweight') return 0

  const filled = sets.filter(s => s.reps !== '' && s.weight !== '')
  if (!filled.length) return currentWeight

  const inc = INC[progKey]
  const [minRep, maxRep] = parseRepRange(repRange)
  const weights = filled.map(s => parseFloat(s.weight) || 0)
  const maxW = Math.max(...weights)
  const minW = Math.min(...weights)

  if (maxW > minW) {
    const heavy = filled.filter(s => parseFloat(s.weight) === maxW)
    const anchor = filled.filter(s => parseFloat(s.weight) === minW)
    const heavyHit = heavy.every(s => parseInt(s.reps) >= minRep)
    const anchorMax = anchor.every(s => parseInt(s.reps) >= maxRep)

    if (!heavyHit) return minW
    if (heavyHit && anchorMax) return round25((maxW + minW) / 2)
    return minW
  }

  const w = parseFloat(filled[0].weight) || currentWeight
  const anyBelowMin = filled.some(s => parseInt(s.reps) < minRep)
  const anyHard = filled.some(s => s.rpe === 'hard')
  const allMaxed = filled.every(s => parseInt(s.reps) >= maxRep)
  const easyCount = filled.filter(s => s.rpe === 'easy').length
  const halfSets = Math.ceil(filled.length / 2)

  if (anyBelowMin) return round25(w * 0.9)
  if (anyHard) return w
  if (allMaxed && easyCount >= halfSets) return round25(w + inc * 2)
  if (allMaxed) return round25(w + inc)
  return w
}

export interface Verdict {
  direction: 'up' | 'hold' | 'down'
  nextW: number
  label: string
}

export function verdict(
  progKey: ProgKey,
  repRange: string,
  prescribed: number,
  unit: string,
  sets: SetLog[],
  numSets: number
): Verdict | null {
  if (unit === 'BW') return { direction: 'hold', nextW: 0, label: '→ MAINTAIN BODYWEIGHT' }

  const filled = sets.filter(s => s.reps !== '')
  if (filled.length < numSets) return null

  const next = nextWeight(progKey, repRange, prescribed, unit, sets)

  if (next > prescribed) {
    const isJump = next >= prescribed + INC[progKey] * 2
    return { direction: 'up', nextW: next, label: isJump ? '↑↑ JUMP' : '↑ PROGRESS' }
  }
  if (next < prescribed) return { direction: 'down', nextW: next, label: '↓ DELOAD' }
  return { direction: 'hold', nextW: next, label: '→ HOLD' }
}

export const RPE_CYCLE: Record<string, RPE> = {
  '': 'easy',
  easy: 'perfect',
  perfect: 'hard',
  hard: null,
}

export function cycleRPE(current: RPE): RPE {
  return RPE_CYCLE[current ?? ''] ?? null
}
