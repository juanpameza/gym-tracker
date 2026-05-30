export function calc1RM(weight: number, reps: number): number | null {
  if (!weight || !reps || weight <= 0 || reps <= 0) return null
  return weight * (1 + reps / 30)
}

export function round5(n: number): number {
  return Math.round(n / 5) * 5
}

export function workingWeight(oneRM: number): number {
  return round5(oneRM * 0.725)
}
