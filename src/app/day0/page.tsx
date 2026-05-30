'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calc1RM, round5, workingWeight } from '@/lib/epley'
import { repTarget } from '@/lib/routine'
import type { Routine } from '@/lib/routine'

interface LiftEntry {
  weight: string
  reps: string
  notes: string
}

// A baseline test lift, derived from the user's routine + targets (no hardcoded list).
interface Day0Lift {
  id: string
  name: string
  protocol: string
  targetReps: number
  session: 'A' | 'B'
  target1rm: number
}

interface ResultRow {
  id: string
  name: string
  tested: string
  est1rm: number
  target1rm: number
  pct: number
}

interface SavedResults {
  [liftId: string]: { name: string; weight: number; reps: number; est1rm: number; workingWeight: number }
}

type Profile = Record<string, string>
type Targets = Record<string, number>

// Derive the baseline lifts from the routine: every exercise that has a
// strength target, in routine order, deduped, split evenly into two sessions.
function deriveLifts(routine: Routine, targets: Targets): Day0Lift[] {
  const seen = new Set<string>()
  const base: Omit<Day0Lift, 'session'>[] = []
  for (const day of Object.values(routine)) {
    for (const ex of day.exercises) {
      if (seen.has(ex.id)) continue
      const target1rm = targets[ex.id]
      if (!target1rm) continue
      seen.add(ex.id)
      const tr = repTarget(ex.reps)
      base.push({ id: ex.id, name: ex.name, protocol: `Top set · ${tr} reps @ RPE 8`, targetReps: tr, target1rm })
    }
  }
  const half = Math.ceil(base.length / 2)
  return base.map((l, i) => ({ ...l, session: i < half ? 'A' : 'B' }))
}

function buildDay0Clipboard(rows: ResultRow[], profile: Profile): string {
  const weight = profile.weight ? `${profile.weight} lbs` : 'bodyweight unknown'
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  const context = [profile.split, profile.experience, profile.goal, profile.horizon].filter(Boolean).join(' · ')

  let text = `DAY 0 BASELINE RESULTS — ${weight} — ${date}\n`
  text += '════════════════════════════════════════\n'
  for (const row of rows) {
    text += `${row.name.padEnd(26)} ${row.tested.padEnd(8)} → 1RM: ${(row.est1rm + ' lbs').padEnd(10)} / target ${(row.target1rm + ' lbs').padEnd(10)} (${row.pct}%)\n`
  }
  text += '════════════════════════════════════════\n'
  if (context) text += `Context: ${context}\n`
  text += `
Based on this baseline${profile.horizon ? ` (goal horizon: ${profile.horizon})` : ''}, please:
1. Recalibrate the starting weights in my routine to match my current level
2. Confirm or update my strength targets
3. Outline my week-by-week progression path to hit those targets

Return the updated program as ONE JSON block in the same shape as before — "routine" (days → exercises with id, name, qual, sets, reps, weight, unit, progKey) and "targets" (keyed by exercise id):
\`\`\`json
{ "routine": { "day1": { "name": "...", "meta": "...", "exercises": [ /* ... */ ] } }, "targets": { /* id: goal1RM */ } }
\`\`\``
  return text
}

export default function Day0Page() {
  const router = useRouter()
  const [lifts, setLifts] = useState<Day0Lift[]>([])
  const [entries, setEntries] = useState<Record<string, LiftEntry>>({})
  const [report, setReport] = useState<ResultRow[] | null>(null)
  const [saved, setSaved] = useState<SavedResults | null>(null)
  const [programId, setProgramId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile>({})
  const [loaded, setLoaded] = useState(false)
  const [copyLabel, setCopyLabel] = useState('▸ COPY TO CLIPBOARD')
  const [saving, setSaving] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoaded(true); return }

      const { data: prog } = await supabase
        .from('programs')
        .select('id, profile, routine, targets')
        .eq('user_id', user.id)
        .single()

      if (prog) {
        setProgramId(prog.id)
        setProfile((prog.profile as Profile) || {})
        const derived = deriveLifts((prog.routine as Routine) || {}, (prog.targets as Targets) || {})
        setLifts(derived)
        setEntries(Object.fromEntries(derived.map(l => [l.id, { weight: '', reps: '', notes: '' }])))
      }

      let query = supabase
        .from('day0_results')
        .select('results')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(1)
      if (prog) query = query.eq('program_id', prog.id)
      const { data: existing } = await query.single()
      if (existing?.results) setSaved(existing.results as SavedResults)
      setLoaded(true)
    }
    load()
  }, [])

  function updateEntry(id: string, field: keyof LiftEntry, value: string) {
    setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function calc(id: string): { est1rm: number | null; working: number | null } {
    const e = entries[id]
    const w = parseFloat(e.weight)
    const r = parseFloat(e.reps)
    const est = calc1RM(w, r)
    return { est1rm: est ? round5(est) : null, working: est ? workingWeight(est) : null }
  }

  function generateReport() {
    const rows: ResultRow[] = []
    for (const ex of lifts) {
      const e = entries[ex.id]
      const w = parseFloat(e.weight)
      const r = parseFloat(e.reps)
      const est = calc1RM(w, r)
      if (!est) continue
      const est1rm = round5(est)
      rows.push({
        id: ex.id,
        name: ex.name,
        tested: `${w}×${r}`,
        est1rm,
        target1rm: ex.target1rm,
        pct: Math.round((est1rm / ex.target1rm) * 100),
      })
    }
    if (!rows.length) {
      alert('Fill in at least one lift before generating.')
      return
    }
    setReport(rows)
  }

  async function saveAndCopy() {
    if (!report) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setSaving(true)
      const results: SavedResults = {}
      for (const row of report) {
        const w = parseFloat(entries[row.id].weight)
        const r = parseFloat(entries[row.id].reps)
        const est = calc1RM(w, r)
        results[row.id] = {
          name: row.name,
          weight: w,
          reps: r,
          est1rm: row.est1rm,
          workingWeight: est ? workingWeight(est) : 0,
        }
      }
      await supabase.from('day0_results').upsert({
        user_id: user.id,
        program_id: programId,
        completed_at: new Date().toISOString(),
        results,
      })
      setSaved(results)
      setSaving(false)
    }
    copyToClipboard(report)
  }

  function copyToClipboard(rows: ResultRow[]) {
    const text = buildDay0Clipboard(rows, profile)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => flash())
    } else {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      flash()
    }
  }

  function flash() {
    setCopyLabel('✓ COPIED')
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopyLabel('▸ COPY TO CLIPBOARD'), 2000)
  }

  const sessionA = lifts.filter(e => e.session === 'A')
  const sessionB = lifts.filter(e => e.session === 'B')

  if (saved && !report) {
    return <SavedView results={saved} onRetake={() => setSaved(null)} onImport={() => router.push('/import')} onGoLog={() => router.push('/log/1/1')} />
  }

  // No routine/targets yet → can't derive a personalized baseline test.
  if (loaded && lifts.length === 0) {
    return <NoProgramView onImport={() => router.push('/import')} onIntake={() => router.push('/intake')} />
  }

  const statsLine = [
    profile.height,
    profile.weight ? `${profile.weight} LBS` : null,
    profile.split,
    profile.goal ? `GOAL: ${profile.goal.toUpperCase()}` : null,
    profile.horizon,
  ].filter(Boolean).join(' / ')

  return (
    <div className="min-h-screen px-4 py-8 pb-20"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">FORM 00</div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ BASELINE PROTOCOL ★</div>
          <h1 className="font-display font-black leading-none text-5xl mb-1">
            DAY <span className="text-[#d9a441] italic">0</span><br />TEST.
          </h1>
          {statsLine && (
            <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-4 border-t border-dashed border-[#2a2a25] pt-4">
              {statsLine}
            </div>
          )}
        </header>

        {/* Instructions */}
        <div className="border-l-4 border-[#d9a441] pl-4 pr-2 py-3 mb-9 bg-[rgba(217,164,65,0.04)] text-[13px] leading-relaxed">
          <span className="text-[#d9a441] font-bold">// PROTOCOL</span>
          <br />
          Work up to a top set per lift. Stop when you have 2 reps left in the tank (RPE 8). <span className="text-[#d9a441] font-bold">Do not max out.</span>
          {' '}Rest 2-3 min between heavy attempts. Warm up properly before testing weight.
          Split into two sessions, 2 days apart.
          <p className="text-[#6b6a62] text-[11px] mt-2">
            These lifts come from your program. Enter weight + actual reps; est. 1RM uses the Epley formula (weight × (1 + reps/30)).
          </p>
        </div>

        {/* Session A */}
        {sessionA.length > 0 && (
          <SessionBlock label="SESSION A" title="First Half" note={`~45 min · ${sessionA.length} lifts`} exercises={sessionA} entries={entries} calc={calc} updateEntry={updateEntry} />
        )}

        {/* Session B */}
        {sessionB.length > 0 && (
          <SessionBlock label="SESSION B" title="Second Half" note={`~60 min · ${sessionB.length} lifts`} exercises={sessionB} entries={entries} calc={calc} updateEntry={updateEntry} />
        )}

        {/* Generate */}
        {!report && (
          <div className="mt-12 border-2 border-[#f4ede0] p-7 text-center bg-[linear-gradient(180deg,rgba(217,164,65,0.04),transparent)]">
            <h2 className="font-display font-black text-2xl mb-2">Done with both sessions?</h2>
            <p className="text-[12px] text-[#6b6a62] tracking-[0.1em] mb-5">GENERATE RESULTS SUMMARY → SHARE WITH CLAUDE</p>
            <button onClick={generateReport} className="bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] hover:-translate-y-px text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 px-9 transition-all cursor-pointer">
              ▸ GENERATE SUMMARY
            </button>
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="mt-8 bg-[#f4ede0] text-[#1a1a17] p-8 border-2 border-[#d9a441] relative">
            <div className="absolute -top-3 left-6 bg-[#0e0e0c] text-[#d9a441] px-3 py-0.5 text-[10px] tracking-[0.25em]">// RESULTS</div>
            <h3 className="font-display font-black text-xl mb-1">BASELINE REPORT</h3>
            <p className="text-[10px] tracking-[0.2em] text-[#6b6a62] mb-5 uppercase">
              {profile.weight ? `${profile.weight} lbs · ` : ''}{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {['Lift', 'Tested', 'Est. 1RM', 'Target 1RM', '% to Goal'].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-[10px] tracking-[0.18em] uppercase text-[#6b6a62] font-bold border-b border-[#e0d8c8]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.map(row => (
                    <tr key={row.id}>
                      <td className="py-2 px-2 border-b border-[#e0d8c8] font-display text-[15px] font-bold">{row.name}</td>
                      <td className="py-2 px-2 border-b border-[#e0d8c8] font-bold tabular-nums">{row.tested}</td>
                      <td className="py-2 px-2 border-b border-[#e0d8c8] font-bold tabular-nums">{row.est1rm} lbs</td>
                      <td className="py-2 px-2 border-b border-[#e0d8c8] font-bold tabular-nums">{row.target1rm} lbs</td>
                      <td className="py-2 px-2 border-b border-[#e0d8c8] font-bold tabular-nums">{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-5 flex-wrap">
              <button onClick={saveAndCopy} disabled={saving}
                className="bg-[#1a1a17] hover:bg-[#c8311a] text-[#f4ede0] px-5 py-3 font-bold text-[11px] tracking-[0.2em] cursor-pointer transition-colors disabled:opacity-50">
                {saving ? '...' : copyLabel}
              </button>
              <button onClick={() => router.push('/import')}
                className="border border-[#d9a441] text-[#d9a441] hover:bg-[#d9a441] hover:text-[#1a1a17] px-5 py-3 font-bold text-[11px] tracking-[0.2em] cursor-pointer transition-colors">
                ▸ IMPORT PROGRAM →
              </button>
            </div>
            <p className="mt-4 text-[11px] text-[#6b6a62] leading-relaxed border-t border-dashed border-[#ccc] pt-4">
              Paste this into Claude to recalibrate your week-1 weights. Then import Claude&apos;s JSON response on the next screen.
            </p>
          </div>
        )}

        <footer className="mt-16 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// END FORM 00 //</footer>
      </div>
    </div>
  )
}

function SessionBlock({
  label, title, note, exercises, entries, calc, updateEntry,
}: {
  label: string
  title: string
  note: string
  exercises: Day0Lift[]
  entries: Record<string, LiftEntry>
  calc: (id: string) => { est1rm: number | null; working: number | null }
  updateEntry: (id: string, field: keyof LiftEntry, value: string) => void
}) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline gap-4 mb-5 pb-2 border-b border-[#2a2a25]">
        <span className="text-[10px] tracking-[0.3em] text-[#c8311a] border border-[#c8311a] px-2 py-0.5">{label}</span>
        <span className="font-display text-2xl font-bold">{title}</span>
        <span className="ml-auto text-[10px] text-[#6b6a62] tracking-[0.15em]">{note}</span>
      </div>
      {exercises.map((ex, i) => (
        <LiftCard key={ex.id} num={i + 1} ex={ex} entry={entries[ex.id]} calc={calc} updateEntry={updateEntry} target1rm={ex.target1rm} />
      ))}
    </section>
  )
}

function LiftCard({
  num, ex, entry, calc, updateEntry, target1rm,
}: {
  num: number
  ex: Day0Lift
  entry: LiftEntry
  calc: (id: string) => { est1rm: number | null; working: number | null }
  updateEntry: (id: string, field: keyof LiftEntry, value: string) => void
  target1rm: number
}) {
  const { est1rm, working } = calc(ex.id)

  return (
    <div className="border border-[#2a2a25] hover:border-[#d9a441] p-5 mb-3 transition-colors">
      <div className="flex items-start gap-4 mb-4">
        <span className="text-[11px] text-[#6b6a62] font-bold pt-1">0{num}</span>
        <div className="flex-1">
          <div className="font-display text-[19px] font-bold leading-tight">{ex.name}</div>
          <div className="text-[10px] text-[#d9a441] tracking-[0.15em] uppercase mt-0.5">{ex.protocol}</div>
        </div>
        <div className="text-[10px] text-[#6b6a62] tracking-[0.1em] text-right">
          TARGET<br /><span className="text-[#f4ede0] font-bold">{target1rm} lbs</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <InputField label="Weight (lbs)" value={entry.weight} type="number" inputmode="decimal"
          onChange={v => updateEntry(ex.id, 'weight', v)} placeholder="0" />
        <InputField label="Reps completed" value={entry.reps} type="number" inputmode="numeric"
          onChange={v => updateEntry(ex.id, 'reps', v)} placeholder={String(ex.targetReps)} />
        <InputField label="Notes" value={entry.notes} type="text"
          onChange={v => updateEntry(ex.id, 'notes', v)} placeholder="form / feel" />
      </div>
      <div className="mt-4 pt-3 border-t border-dashed border-[#2a2a25] flex justify-between items-baseline text-[11px] tracking-[0.15em] text-[#6b6a62]">
        <span>EST. 1RM</span>
        <span className={`font-display text-2xl font-bold ${est1rm ? 'text-[#f4ede0]' : 'text-[#2a2a25]'}`}>
          {est1rm ? `${est1rm} LBS` : '— LBS'}
        </span>
        <span className="text-[#d9a441] text-[13px]">
          {working ? `WORKING SET: ${working} LBS` : 'WORKING SET: —'}
        </span>
      </div>
    </div>
  )
}

function InputField({ label, value, type, inputmode, onChange, placeholder }: {
  label: string
  value: string
  type: string
  inputmode?: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] tracking-[0.25em] text-[#6b6a62] uppercase">{label}</label>
      <input
        type={type}
        inputMode={inputmode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent border-b-[1.5px] border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-lg font-medium py-1.5 outline-none transition-colors placeholder:text-[#2a2a25] w-full"
      />
    </div>
  )
}

function NoProgramView({ onImport, onIntake }: { onImport: () => void; onIntake: () => void }) {
  return (
    <div className="min-h-screen px-4 py-8 pb-20"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)' }}>
      <div className="max-w-2xl mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">FORM 00</div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ BASELINE PROTOCOL ★</div>
          <h1 className="font-display font-black leading-none text-5xl">
            DAY <span className="text-[#d9a441] italic">0</span><br />TEST.
          </h1>
        </header>
        <div className="border-l-4 border-[#d9a441] pl-4 pr-2 py-3 mb-6 bg-[rgba(217,164,65,0.04)] text-[13px] leading-relaxed">
          <span className="text-[#d9a441] font-bold">// NO PROGRAM YET</span>
          <br />
          The Day 0 test is built from your personalized program — the lifts and goals Claude sets for you. Import your program first, then come back to test your baseline.
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={onImport} className="flex-1 min-w-[140px] bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer">
            ▸ IMPORT PROGRAM
          </button>
          <button onClick={onIntake} className="flex-1 min-w-[140px] border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer">
            ▸ INTAKE FORM
          </button>
        </div>
      </div>
    </div>
  )
}

function SavedView({ results, onRetake, onImport, onGoLog }: {
  results: SavedResults
  onRetake: () => void
  onImport: () => void
  onGoLog: () => void
}) {
  return (
    <div className="min-h-screen px-4 py-8 pb-20"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)' }}>
      <div className="max-w-2xl mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">FORM 00</div>
          <div className="border border-[#4a9b5e] text-[#4a9b5e] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ COMPLETED ★</div>
          <h1 className="font-display font-black leading-none text-5xl">
            DAY <span className="text-[#d9a441] italic">0</span><br />DONE.
          </h1>
        </header>
        <div className="bg-[#f4ede0] text-[#1a1a17] p-8 border-2 border-[#4a9b5e] mb-6">
          <h3 className="font-display font-black text-xl mb-5">BASELINE RESULTS</h3>
          <div className="space-y-3">
            {Object.entries(results).map(([id, r]) => (
              <div key={id} className="flex justify-between items-baseline border-b border-[#e0d8c8] pb-2">
                <span className="font-display font-bold text-sm">{r.name ?? id}</span>
                <span className="text-[12px] text-[#6b6a62]">{r.weight}×{r.reps} → <strong>{r.est1rm} lbs 1RM</strong></span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={onImport} className="flex-1 min-w-[140px] bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer">
            ▸ IMPORT PROGRAM
          </button>
          <button onClick={onGoLog} className="flex-1 min-w-[140px] border border-[#4a9b5e] text-[#4a9b5e] hover:bg-[#4a9b5e] hover:text-[#1a1a17] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer">
            ▸ START WEEK 1
          </button>
          <button onClick={onRetake} className="flex-1 min-w-[140px] border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer">
            ↺ RETAKE TEST
          </button>
        </div>
      </div>
    </div>
  )
}
