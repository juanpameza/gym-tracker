'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type OptionField = {
  key: string
  label: string
  options: string[]
  allowCustom?: boolean
}

type TextField = {
  key: string
  label: string
  inputType: 'text' | 'number'
  placeholder: string
}

type FieldDef = OptionField | TextField

function isTextField(f: FieldDef): f is TextField {
  return 'inputType' in f
}

interface StepDef {
  id: string
  title: string
  fields: FieldDef[]
}

const STEPS: StepDef[] = [
  {
    id: 'goal',
    title: 'Training Goals',
    fields: [
      { key: 'goal', label: 'Main goal', options: ['Build muscle/strength', 'Lose fat', 'General fitness', 'Athletic performance'] },
      { key: 'days', label: 'Training days per week', options: ['3 days', '4 days', '5 days', '6 days'] },
      { key: 'experience', label: 'Experience level', options: ['Beginner (<6 months)', 'Intermediate (6mo–2yr)', 'Advanced (2yr+)'] },
    ],
  },
  {
    id: 'setup',
    title: 'Setup',
    fields: [
      { key: 'equipment', label: 'Equipment access', options: ['Full gym (barbells, racks, machines)', 'Dumbbells only', 'Home gym (limited)', 'Bodyweight only'] },
      { key: 'sessionLength', label: 'Session length', options: ['45-60 min', '60-75 min', '75-90 min', '90+ min'] },
      { key: 'injuries', label: 'Injuries or limitations', options: ['None — all clear', 'Lower back issues', 'Shoulder issues', 'Knee issues'], allowCustom: true },
    ],
  },
  {
    id: 'split',
    title: 'Program Preferences',
    fields: [
      { key: 'split', label: 'Preferred split', options: ['Push/Pull/Legs', 'Upper/Lower', 'Full body', 'Bro split (body part)'] },
      { key: 'priority', label: 'Priority muscle groups', options: ['Chest + Arms', 'Back + Lats', 'Legs + Glutes', 'Shoulders + Arms'] },
    ],
  },
  {
    id: 'stats',
    title: 'Personal Stats',
    fields: [
      { key: 'age', label: 'Age range', options: ['18-24', '25-34', '35-44', '45+'] },
      { key: 'sex', label: 'Biological sex', options: ['Male', 'Female'] },
      { key: 'height', label: 'Height', inputType: 'text', placeholder: 'e.g. 5\'11"' },
      { key: 'weight', label: 'Current bodyweight (lbs)', inputType: 'number', placeholder: 'e.g. 180' },
      { key: 'horizon', label: 'Goal time horizon', options: ['3 months', '6 months', '12 months', 'Ongoing'] },
    ],
  },
]

type Answers = Record<string, string>

function buildClipboardText(a: Answers): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  const template = `{
  "routine": {
    "day1": {
      "name": "Push",
      "meta": "Chest · Shoulders · Triceps",
      "exercises": [
        { "id": "bench", "name": "Barbell Bench Press", "qual": "", "sets": 4, "reps": "6-8", "weight": 95, "unit": "lbs", "progKey": "compound-upper" }
      ]
    }
  },
  "targets": { "bench": 205 }
}`
  return `INTAKE FORM — ${date}
════════════════════════════════════════
Goal: ${a.goal}
Days/week: ${a.days}
Experience: ${a.experience}
Equipment: ${a.equipment}
Session length: ${a.sessionLength}
Injuries: ${a.injuries}
Split: ${a.split}
Priority: ${a.priority}
Age: ${a.age} | Sex: ${a.sex} | Height: ${a.height} | Weight: ${a.weight} lbs
Time horizon: ${a.horizon}
════════════════════════════════════════

Design a complete, personalized training program for me based on the profile above. Build it for MY split, training days, equipment, experience, injuries, and priorities — do not assume a fixed template.

Return ONE JSON block at the end of your response with this exact shape:
- "routine": one entry per training day, keyed "day1", "day2", ... (match my days/week).
  Each day has "name", "meta" (a short muscle-group subtitle), and "exercises".
  Each exercise has:
    • "id": a short unique slug (e.g. "bench", "incdb")
    • "name": full exercise name
    • "qual": optional note like "(per hand)" or "" if none
    • "sets": integer
    • "reps": a range string like "8-10" (or "10-15")
    • "weight": starting working weight in lbs, calibrated to my level (0 for bodyweight)
    • "unit": "lbs" or "BW"
    • "progKey": one of "compound-upper", "compound-upper-small", "compound-lower", "accessory", "isolation", "bodyweight"
- "targets": goal estimated-1RM (lbs) for my main lifts over my ${a.horizon} time horizon, keyed by the SAME exercise "id" used in the routine. Only include the key compound lifts.

Example (illustrative — replace with my full program):
\`\`\`json
${template}
\`\`\``
}

export default function IntakePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  // Tracks which fields have "Other..." toggled open
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [clipboardDone, setClipboardDone] = useState(false)
  const [copyLabel, setCopyLabel] = useState('▸ COPY TO CLIPBOARD')

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1

  const stepFilled = currentStep.fields.every(f => {
    const val = answers[f.key]
    return Boolean(val) && val.trim().length > 0
  })

  function setAnswer(key: string, val: string) {
    setAnswers(prev => ({ ...prev, [key]: val }))
  }

  async function handleFinish() {
    setSaving(true)
    setErrorMsg('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setErrorMsg('You are not signed in. Sign in and try again.'); return }

    // One program per user. Update the existing row (preserving any routine /
    // targets already imported from Claude) or insert a fresh one. We avoid an
    // ON CONFLICT upsert here because that requires a unique constraint on
    // user_id — without it the upsert fails silently and no program is saved.
    const { data: existing } = await supabase
      .from('programs')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    const fields = { profile: answers, intake_chat: buildClipboardText(answers) }
    const { error } = existing
      ? await supabase.from('programs').update(fields).eq('user_id', user.id)
      : await supabase.from('programs').insert({ user_id: user.id, ...fields })

    setSaving(false)
    if (error) {
      setErrorMsg(`Couldn't save your intake: ${error.message}`)
      return
    }
    setClipboardDone(true)
  }

  function copyToClipboard() {
    const text = buildClipboardText(answers)
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
    setTimeout(() => setCopyLabel('▸ COPY TO CLIPBOARD'), 2000)
  }

  if (clipboardDone) {
    return (
      <div
        className="min-h-screen px-4 py-8 pb-20"
        style={{ backgroundImage: 'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)', backgroundAttachment: 'fixed' }}
      >
        <div className="max-w-lg mx-auto">
          <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
            <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">STEP 2</div>
            <div className="border border-[#4a9b5e] text-[#4a9b5e] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">★ INTAKE SAVED ★</div>
            <h1 className="font-display font-black leading-none text-4xl">
              COPY TO <span className="text-[#d9a441] italic">CLAUDE.</span>
            </h1>
          </header>

          <div className="border-l-4 border-[#d9a441] pl-4 pr-2 py-3 mb-6 bg-[rgba(217,164,65,0.04)] text-[13px] leading-relaxed">
            <span className="text-[#d9a441] font-bold">// NEXT STEP</span>
            <br />
            Paste this into Claude. It will reason about your goals and return targets + starting weights as a JSON block. Then come back and import that response — your targets need to be set before the Day 0 test.
          </div>

          <div className="bg-[#f4ede0] text-[#1a1a17] p-4 mb-6 border border-[#d9a441] text-[11px] font-mono leading-relaxed overflow-y-auto max-h-72 whitespace-pre-wrap">
            {buildClipboardText(answers)}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={copyToClipboard}
              className="bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 transition-all cursor-pointer"
            >
              {copyLabel}
            </button>
            <button
              onClick={() => router.push('/import')}
              className="border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer"
            >
              ▸ IMPORT FROM CLAUDE →
            </button>
          </div>

          <p className="text-center text-[10px] text-[#6b6a62] tracking-widest mt-6">
            Import Claude&apos;s targets first — Day 0 test uses them to show your % to goal.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen px-4 py-8 pb-20"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="max-w-lg mx-auto">
        <header className="border-2 border-[#f4ede0] p-6 mb-7 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">
            FORM 0{step + 1}
          </div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">
            ★ INTAKE ★
          </div>
          <h1 className="font-display font-black leading-none text-4xl">
            {currentStep.title.toUpperCase().split(' ')[0]}{' '}
            <span className="text-[#d9a441] italic">{currentStep.title.toUpperCase().split(' ').slice(1).join(' ')}.</span>
          </h1>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 transition-colors ${i <= step ? 'bg-[#d9a441]' : 'bg-[#2a2a25]'}`} />
            ))}
          </div>
          <p className="text-[10px] text-[#6b6a62] tracking-[0.2em] mt-2">
            STEP {step + 1} / {STEPS.length}
          </p>
        </header>

        <div className="space-y-6 mb-8">
          {currentStep.fields.map(field => {
            if (isTextField(field)) {
              return (
                <div key={field.key}>
                  <label className="block text-[10px] tracking-[0.2em] text-[#6b6a62] uppercase mb-3">
                    {field.label}
                  </label>
                  <input
                    type={field.inputType}
                    inputMode={field.inputType === 'number' ? 'decimal' : undefined}
                    placeholder={field.placeholder}
                    value={answers[field.key] ?? ''}
                    onChange={e => setAnswer(field.key, e.target.value)}
                    className="w-full bg-transparent border-b-[1.5px] border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-lg font-medium py-2 outline-none transition-colors placeholder:text-[#3a3a32]"
                  />
                </div>
              )
            }

            const isCustom = customOpen[field.key]
            const selectedIsPreset = field.options.includes(answers[field.key] ?? '')

            return (
              <div key={field.key}>
                <label className="block text-[10px] tracking-[0.2em] text-[#6b6a62] uppercase mb-3">
                  {field.label}
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {field.options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => {
                        setAnswer(field.key, opt)
                        setCustomOpen(prev => ({ ...prev, [field.key]: false }))
                      }}
                      className={`border px-4 py-3 text-left text-[13px] font-medium tracking-wide transition-all cursor-pointer ${
                        answers[field.key] === opt
                          ? 'border-[#d9a441] bg-[rgba(217,164,65,0.08)] text-[#d9a441]'
                          : 'border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
                      }`}
                    >
                      {answers[field.key] === opt && <span className="mr-2 text-[#d9a441]">▸</span>}
                      {opt}
                    </button>
                  ))}

                  {field.allowCustom && (
                    <button
                      onClick={() => {
                        setCustomOpen(prev => ({ ...prev, [field.key]: true }))
                        // Clear the answer so the field shows as unfilled until text is typed
                        if (selectedIsPreset) setAnswer(field.key, '')
                      }}
                      className={`border px-4 py-3 text-left text-[13px] font-medium tracking-wide transition-all cursor-pointer ${
                        isCustom || (!selectedIsPreset && answers[field.key])
                          ? 'border-[#d9a441] bg-[rgba(217,164,65,0.08)] text-[#d9a441]'
                          : 'border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
                      }`}
                    >
                      {(isCustom || (!selectedIsPreset && answers[field.key])) && (
                        <span className="mr-2 text-[#d9a441]">▸</span>
                      )}
                      Other / describe...
                    </button>
                  )}
                </div>

                {(isCustom || (!selectedIsPreset && answers[field.key] && field.allowCustom)) && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Describe your injury or limitation..."
                      value={(!selectedIsPreset && answers[field.key]) ? answers[field.key] : ''}
                      onChange={e => setAnswer(field.key, e.target.value)}
                      className="w-full bg-transparent border-b-[1.5px] border-[#d9a441] text-[#f4ede0] text-[15px] font-medium py-2 outline-none placeholder:text-[#3a3a32]"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {errorMsg && (
          <div className="border-l-4 border-[#c8311a] pl-4 py-2 mb-4 bg-[rgba(200,49,26,0.04)]">
            <p className="text-[12px] text-[#c8311a]">{errorMsg}</p>
          </div>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer"
            >
              ← BACK
            </button>
          )}
          <button
            onClick={isLast ? handleFinish : () => setStep(s => s + 1)}
            disabled={!stepFilled || saving}
            className="flex-1 bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.25em] text-[13px] uppercase py-4 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? '...' : isLast ? '▸ LOCK IN PROGRAM' : '▸ NEXT'}
          </button>
        </div>

      </div>
    </div>
  )
}
