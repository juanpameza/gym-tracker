'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PROG_KEYS, UNITS } from '@/lib/routine'
import type { Routine, Exercise } from '@/lib/routine'
import type { ProgKey } from '@/lib/progression'

interface ParsedProgram {
  routine?: Routine | null
  targets?: Record<string, number>
}

function normalizeRoutine(raw: unknown): Routine | null {
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

function normalizeTargets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) out[k] = Math.round(n)
  }
  return out
}

function extractJson(text: string): ParsedProgram | null {
  const blockMatch = text.match(/```json\s*([\s\S]*?)```/)
  const jsonStr = blockMatch ? blockMatch[1].trim() : text.trim()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    const objMatch = text.match(/\{[\s\S]*"(?:routine|targets)"[\s\S]*\}/)
    if (objMatch) {
      try {
        parsed = JSON.parse(objMatch[0])
      } catch {
        return null
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  return {
    routine: normalizeRoutine(obj.routine),
    targets: normalizeTargets(obj.targets),
  }
}

export default function ImportPage() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState<ParsedProgram | null>(null)
  const [hasDay0, setHasDay0] = useState(false)

  function handleTextChange(val: string) {
    setText(val)
    setStatus('idle')
    setErrorMsg('')
    setPreview(val.trim() ? extractJson(val) : null)
  }

  async function handleImport() {
    const parsed = extractJson(text)
    if (!parsed) {
      setErrorMsg('Could not find a valid JSON block in the pasted text. Make sure Claude returned a ```json ... ``` block.')
      setStatus('error')
      return
    }
    const hasRoutine = parsed.routine && Object.keys(parsed.routine).length > 0
    const hasTargets = parsed.targets && Object.keys(parsed.targets).length > 0
    if (!hasRoutine && !hasTargets) {
      setErrorMsg('JSON found but no valid "routine" or "targets". Check that each day has an "exercises" array with id + name.')
      setStatus('error')
      return
    }

    setStatus('saving')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStatus('error'); setErrorMsg('Not signed in.'); return }

    const { data: prog } = await supabase
      .from('programs')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!prog) { setStatus('error'); setErrorMsg('No program found. Complete the intake first.'); return }

    const updates: Record<string, unknown> = {}
    if (hasRoutine) updates.routine = parsed.routine
    if (hasTargets) updates.targets = parsed.targets

    const { error } = await supabase
      .from('programs')
      .update(updates)
      .eq('user_id', user.id)

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }

    const { data: day0 } = await supabase
      .from('day0_results')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    setHasDay0(!!day0)
    setStatus('done')
  }

  const previewDays = preview?.routine ? Object.entries(preview.routine) : []
  const previewExCount = previewDays.reduce((acc, [, d]) => acc + d.exercises.length, 0)
  const targetEntries = preview?.targets ? Object.entries(preview.targets) : []

  return (
    <div
      className="min-h-screen px-4 py-8 pb-20"
      style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
    >
      <div className="max-w-lg mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">FORM 03</div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ IMPORT ★</div>
          <h1 className="font-display font-black leading-none text-4xl">
            IMPORT <span className="text-[#d9a441] italic">PROGRAM.</span>
          </h1>
        </header>

        <div className="border-l-4 border-[#d9a441] pl-4 pr-2 py-3 mb-6 bg-[rgba(217,164,65,0.04)] text-[13px] leading-relaxed">
          <span className="text-[#d9a441] font-bold">// HOW TO USE</span>
          <br />
          Paste Claude&apos;s full response below. The app extracts the JSON block containing your personalized routine and strength targets, and saves them to your program.
        </div>

        {status === 'done' ? (
          <div className="border-2 border-[#4a9b5e] bg-[rgba(74,155,94,0.05)] p-8 text-center mb-6">
            <div className="font-display font-black text-3xl text-[#4a9b5e] mb-3">PROGRAM SET.</div>
            <p className="text-[13px] text-[#f4ede0] mb-6">
              {hasDay0
                ? 'Your routine and targets are saved. Week 1 is ready.'
                : 'Your routine and targets are saved. Now run your Day 0 baseline test.'}
            </p>
            <button
              onClick={() => router.push(hasDay0 ? '/log/1/1' : '/day0')}
              className="bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 px-8 transition-all cursor-pointer"
            >
              {hasDay0 ? '▸ START WEEK 1' : '▸ PROCEED TO DAY 0 TEST'}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-[10px] tracking-[0.2em] text-[#6b6a62] uppercase mb-3">
                Paste Claude&apos;s response
              </label>
              <textarea
                value={text}
                onChange={e => handleTextChange(e.target.value)}
                placeholder="Paste the full response from Claude here..."
                rows={10}
                className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[13px] font-mono p-3 outline-none transition-colors placeholder:text-[#3a3a32] resize-y"
              />
            </div>

            {/* Preview */}
            {preview && (previewDays.length > 0 || targetEntries.length > 0) && (
              <div className="border border-[#4a9b5e] bg-[rgba(74,155,94,0.04)] p-4 mb-5">
                <p className="text-[10px] tracking-[0.2em] text-[#4a9b5e] font-bold uppercase mb-3">✓ JSON detected</p>
                {previewDays.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-[#6b6a62] tracking-[0.15em] uppercase mb-1">
                      Routine ({previewDays.length} days · {previewExCount} exercises)
                    </p>
                    <div className="space-y-1">
                      {previewDays.map(([dk, d]) => (
                        <div key={dk} className="flex justify-between text-[12px]">
                          <span className="text-[#f4ede0] font-bold">{d.name}</span>
                          <span className="text-[#6b6a62]">{d.exercises.length} exercises</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {targetEntries.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[#6b6a62] tracking-[0.15em] uppercase mb-1">Targets (strength goals)</p>
                    <div className="grid grid-cols-2 gap-1">
                      {targetEntries.map(([k, v]) => (
                        <div key={k} className="flex justify-between text-[12px]">
                          <span className="text-[#6b6a62]">{k}</span>
                          <span className="text-[#f4ede0] font-bold">{v} lbs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="border-l-4 border-[#c8311a] pl-4 py-2 mb-4 bg-[rgba(200,49,26,0.04)]">
                <p className="text-[12px] text-[#c8311a]">{errorMsg}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={!text.trim() || status === 'saving'}
                className="flex-1 bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 transition-all disabled:opacity-50 cursor-pointer"
              >
                {status === 'saving' ? '...' : '▸ IMPORT PROGRAM'}
              </button>
              <button
                onClick={() => router.push('/day0')}
                className="flex-1 border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer"
              >
                SKIP → DAY 0
              </button>
            </div>
          </>
        )}

        <footer className="mt-16 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">// FORM 03 //</footer>
      </div>
    </div>
  )
}
