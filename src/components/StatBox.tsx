// Small bordered metric card used across dashboard, log, profile and feed.
export default function StatBox({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="border border-[#2a2a25] p-3 text-center">
      <div
        className={`font-display text-3xl font-black leading-none ${
          accent ? 'text-[#4a9b5e]' : 'text-[#d9a441]'
        }`}
      >
        {value}
      </div>
      <div className="text-[9px] tracking-[0.2em] text-[#6b6a62] uppercase mt-1.5">{label}</div>
    </div>
  )
}
