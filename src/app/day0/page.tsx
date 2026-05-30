'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calc1RM, round5, workingWeight } from '@/lib/epley'
import { DAY0_EXERCISES, STRENGTH_TARGETS } from '@/lib/routine'

interface LiftEntry {
  weight: string
  reps: string
  notes: string
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
  [liftId: string]: { weight: number; reps: number; est1rm: number; workingWeight: number }
}

const INITIAL_ENTRIES: Record<string, LiftEntry> = Object.fromEntries(
  DAY0_EXERCISES.map(ex => [ex.id, { weight: '', reps: '', notes: '' }])
)

export default function Day0Page() {
  const router = useRouter()
  const [entries, setEntries] = useState(INITIAL_ENTRIES)
  const [report, setReport] = useState<ResultRow[] | null>(null)
  const [saved, setSaved] = useState<SavedResults | null>(null)
  const [programId, setProgramId] = useState<string | null>(null)
  const [copyLabel, setCopyLabel] = useState('▸ COPY TO CLIPBOARD')
  const [saving, setSaving] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prog } = await supabase
        .from('programs')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (prog) setProgramId(prog.id)

      let query = supabase
        .from('day0_results')
        .select('results')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(1)
      if (prog) query = query.eq('program_id', prog.id)
      const { data: existing } = await query.single()
      if (existing?.results) setSaved(existing.results as SavedResults)
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
    for (const ex of DAY0_EXERCISES) {
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
        const ex = DAY0_EXERCISES.find(e => e.id === row.id)!
        const w = parseFloat(entries[row.id].weight)
        const r = parseFloat(entries[row.id].reps)
        const est = calc1RM(w, r)
        results[row.id] = {
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
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
    let text = `DAY 0 BASELINE RESULTS — JP, 180 lbs — ${date}\n`
    text += '════════════════════════════════════════\n'
    for (const row of rows) {
      text += `${row.name.padEnd(26)} ${row.tested.padEnd(8)} → 1RM: ${(row.est1rm + ' lbs').padEnd(10)} / target ${(row.target1rm + ' lbs').padEnd(10)} (${row.pct}%)\n`
    }
    text += '════════════════════════════════════════\n'
    text += 'Claude — build my 6-month progression plan from this. Context: PPL+ 4-day, novice linear progression, goal: build muscle/strength, 6-month horizon, 180 lbs bodyweight.'

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

  const sessionA = DAY0_EXERCISES.filter(e => e.session === 'A')
  const sessionB = DAY0_EXERCISES.filter(e => e.session === 'B')

  if (saved && !report) {
    return <SavedView results={saved} onRetake={() => setSaved(null)} onGoLog={() => router.push('/log/1/1')} />
  }

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
          <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-4 border-t border-dashed border-[#2a2a25] pt-4">
            JP / 6&apos;0&quot; / 180 LBS / 4-DAY PPL+ / GOAL: BUILD STRENGTH × 6 MONTHS
          </div>
        </header>

        {/* Instructions */}
        <div className="border-l-4 border-[#d9a441] pl-4 pr-2 py-3 mb-9 bg-[rgba(217,164,65,0.04)] text-[13px] leading-relaxed">
          <span className="text-[#d9a441] font-bold">// PROTOCOL</span>
          <br />
          Work up to a top set per lift. Stop when you have 2 reps left in the tank (RPE 8). <span className="text-[#d9a441] font-bold">Do not max out.</span>
          {' '}Rest 2-3 min between heavy attempts. Warm up properly before testing weight.
          Split into two sessions, 2 days apart.
          <p className="text-[#6b6a62] text-[11px] mt-2">
            Reps are pre-set per Epley formula (1RM = weight × (1 + reps/30)). Enter weight + actual reps achieved.
          </p>
        </div>

        {/* Session A */}
        <SessionBlock label="SESSION A" title="Push Focus" note="~45 min · 3 lifts" exercises={sessionA} entries={entries} calc={calc} updateEntry={updateEntry} />

        {/* Session B */}
        <SessionBlock label="SESSION B" title="Pull + Legs" note="~60 min · 4 lifts" exercises={sessionB} entries={entries} calc={calc} updateEntry={updateEntry} />

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
              JP · 180 lbs · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
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
              <button onClick={() => router.push('/log/1/1')}
                className="border border-[#1a1a17] hover:bg-[#1a1a17] hover:text-[#f4ede0] px-5 py-3 font-bold text-[11px] tracking-[0.2em] cursor-pointer transition-colors">
                ▸ GO TO WEEK 1
              </button>
            </div>
            <p className="mt-4 text-[11px] text-[#6b6a62] leading-relaxed border-t border-dashed border-[#ccc] pt-4">
              Paste this summary into Claude to generate your personalized 6-month progression plan with weekly load targets.
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
  exercises: typeof DAY0_EXERCISES
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
        <LiftCard key={ex.id} num={i + 1} ex={ex} entry={entries[ex.id]} calc={calc} updateEntry={updateEntry} />
      ))}
    </section>
  )
}

function LiftCard({
  num, ex, entry, calc, updateEntry,
}: {
  num: number
  ex: typeof DAY0_EXERCISES[0]
  entry: LiftEntry
  calc: (id: string) => { est1rm: number | null; working: number | null }
  updateEntry: (id: string, field: keyof LiftEntry, value: string) => void
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

function SavedView({ results, onRetake, onGoLog }: {
  results: SavedResults
  onRetake: () => void
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
            {Object.entries(results).map(([id, r]) => {
              const ex = DAY0_EXERCISES.find(e => e.id === id)
              if (!ex) return null
              return (
                <div key={id} className="flex justify-between items-baseline border-b border-[#e0d8c8] pb-2">
                  <span className="font-display font-bold text-sm">{ex.name}</span>
                  <span className="text-[12px] text-[#6b6a62]">{r.weight}×{r.reps} → <strong>{r.est1rm} lbs 1RM</strong></span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={onGoLog} className="flex-1 min-w-[140px] bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer">
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
