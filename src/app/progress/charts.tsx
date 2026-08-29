// Small inline-SVG charts in the app's mono / hairline aesthetic. Server
// components (no state) — they just draw what they're given.

const AMBER = '#d9a441'
const GREEN = '#4a9b5e'
const RED = '#c8311a'
const DIM = '#6b6a62'
const RULE = '#2a2a25'
const PAPER = '#f4ede0'

export interface BarItem {
  label: string
  value: number
  max?: number // per-bar ceiling (e.g. planned sessions); defaults to the series max
  tone?: 'green' | 'amber' | 'red' | 'dim'
}

const TONE: Record<NonNullable<BarItem['tone']>, string> = { green: GREEN, amber: AMBER, red: RED, dim: DIM }

// One bar per week. Fits any number of weeks into a fixed 320-unit viewBox;
// value labels are dropped when bars get too narrow to carry them.
export function WeekBars({
  items,
  format = v => String(Math.round(v)),
  height = 110,
}: {
  items: BarItem[]
  format?: (v: number) => string
  height?: number
}) {
  const W = 320
  const n = Math.max(1, items.length)
  const slot = W / n
  const barW = Math.max(6, Math.min(26, slot * 0.62))
  const showValues = slot >= 26
  const top = 16
  const bottom = 18
  const plotH = height - top - bottom
  const seriesMax = Math.max(1, ...items.map(i => i.max ?? i.value))

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto block" role="img">
      <line x1={0} y1={height - bottom + 0.5} x2={W} y2={height - bottom + 0.5} stroke={RULE} strokeWidth={1} />
      {items.map((it, i) => {
        const cap = it.max ?? seriesMax
        const frac = cap > 0 ? Math.min(1, it.value / cap) : 0
        const h = Math.max(it.value > 0 ? 2 : 0, frac * plotH)
        const x = i * slot + (slot - barW) / 2
        const y = top + plotH - h
        const color = it.tone ? TONE[it.tone] : AMBER
        return (
          <g key={i}>
            {it.max !== undefined && (
              <rect x={x} y={top} width={barW} height={plotH} fill="none" stroke={RULE} strokeWidth={1} strokeDasharray="2 2" />
            )}
            <rect x={x} y={y} width={barW} height={h} fill={color} opacity={it.value > 0 ? 0.9 : 0} />
            {showValues && it.value > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={8} fill={PAPER} fontFamily="inherit" letterSpacing={0.5}>
                {format(it.value)}
              </text>
            )}
            {(showValues || i === 0 || i === n - 1 || i % Math.ceil(n / 8) === 0) && (
              <text x={x + barW / 2} y={height - 5} textAnchor="middle" fontSize={8} fill={DIM} fontFamily="inherit" letterSpacing={1}>
                {it.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Est. 1RM over time with an optional target line. The first point may be
// flagged as the Day 0 baseline (drawn hollow).
export function TrendLine({
  values,
  labels,
  target,
  baselineFirst = false,
  height = 84,
}: {
  values: number[]
  labels: string[]
  target?: number | null
  baselineFirst?: boolean
  height?: number
}) {
  const W = 320
  const padX = 8
  const padTop = 12
  const padBottom = 16
  const plotW = W - padX * 2
  const plotH = height - padTop - padBottom
  const all = [...values, ...(target ? [target] : [])]
  if (values.length === 0) return null
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = Math.max(5, hi - lo)
  const yMin = lo - span * 0.15
  const yMax = hi + span * 0.15
  const sy = (v: number) => padTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  const sx = (i: number) => (values.length === 1 ? padX + plotW / 2 : padX + (i / (values.length - 1)) * plotW)
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
  const last = values.length - 1

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto block" role="img">
      {target && (
        <>
          <line x1={padX} y1={sy(target)} x2={W - padX} y2={sy(target)} stroke={GREEN} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
          <text x={W - padX} y={sy(target) - 3} textAnchor="end" fontSize={8} fill={GREEN} fontFamily="inherit" letterSpacing={1}>
            TARGET {target}
          </text>
        </>
      )}
      {values.length > 1 && <path d={path} fill="none" stroke={AMBER} strokeWidth={1.5} strokeLinejoin="round" />}
      {values.map((v, i) => {
        const hollow = baselineFirst && i === 0
        return (
          <g key={i}>
            <circle cx={sx(i)} cy={sy(v)} r={hollow ? 3 : 2.5} fill={hollow ? '#0e0e0c' : AMBER} stroke={AMBER} strokeWidth={1.2} />
            {(i === 0 || i === last) && (
              <text
                x={sx(i)}
                y={sy(v) - 6}
                textAnchor={i === 0 ? 'start' : 'end'}
                fontSize={8}
                fill={PAPER}
                fontFamily="inherit"
              >
                {v}
              </text>
            )}
          </g>
        )
      })}
      {labels.map((l, i) =>
        i === 0 || i === last || (values.length > 6 && i % Math.ceil(values.length / 5) === 0) ? (
          <text
            key={i}
            x={sx(i)}
            y={height - 4}
            textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
            fontSize={8}
            fill={DIM}
            fontFamily="inherit"
            letterSpacing={1}
          >
            {l}
          </text>
        ) : null
      )}
    </svg>
  )
}
