'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_ROUTINE, STRENGTH_TARGETS } from '@/lib/routine'

const STEPS = [
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
      { key: 'injuries', label: 'Injuries or limitations', options: ['None — all clear', 'Lower back issues', 'Shoulder issues', 'Knee issues'] },
    ],
  },
  {
    id: 'split',
    title: 'Program Preferences',
    fields: [
      { key: 'split', label: 'Preferred split', options: ['Push/Pull/Legs + Upper', 'Upper/Lower 4-day', 'Full body 3-day', 'Bro split (body part)'] },
      { key: 'priority', label: 'Priority muscle groups', options: ['Chest + Arms', 'Back + Lats', 'Legs + Glutes', 'Shoulders + Arms'] },
    ],
  },
  {
    id: 'stats',
    title: 'Personal Stats',
    fields: [
      { key: 'age', label: 'Age range', options: ['18-24', '25-34', '35-44', '45+'] },
      { key: 'sex', label: 'Biological sex', options: ['Male', 'Female'] },
      { key: 'height', label: 'Height', options: ['5\'6" or under', '5\'7"–5\'10"', '5\'11"–6\'1"', '6\'2"+'] },
      { key: 'weight', label: 'Current bodyweight (lbs)', options: ['<140', '140-170', '170-200', '200+'] },
      { key: 'horizon', label: 'Goal time horizon', options: ['3 months', '6 months', '12 months', 'Ongoing'] },
    ],
  },
]

type Answers = Record<string, string>

export default function IntakePage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({
    goal: 'Build muscle/strength',
    days: '4 days',
    experience: 'Beginner (<6 months)',
    equipment: 'Full gym (barbells, racks, machines)',
    sessionLength: '60-75 min',
    injuries: 'None — all clear',
    split: 'Push/Pull/Legs + Upper',
    priority: 'Chest + Arms',
    age: '25-34',
    sex: 'Male',
    height: '5\'11"–6\'1"',
    weight: '170-200',
    horizon: '6 months',
  })
  const [saving, setSaving] = useState(false)

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1
  const stepFilled = currentStep.fields.every(f => answers[f.key])

  async function handleFinish() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('programs').upsert(
      {
        user_id: user.id,
        profile: answers,
        routine: DEFAULT_ROUTINE,
        targets: STRENGTH_TARGETS,
        intake_chat: buildIntakeChat(answers),
      },
      { onConflict: 'user_id' }
    )
    router.push('/day0')
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
            FORM 0{step}
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
          {currentStep.fields.map(field => (
            <div key={field.key}>
              <label className="block text-[10px] tracking-[0.2em] text-[#6b6a62] uppercase mb-3">
                {field.label}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {field.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setAnswers(prev => ({ ...prev, [field.key]: opt }))}
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
              </div>
            </div>
          ))}
        </div>

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

        {step === 0 && (
          <p className="text-center text-[10px] text-[#6b6a62] tracking-widest mt-4">
            Pre-filled with your existing program answers — adjust if needed.
          </p>
        )}
      </div>
    </div>
  )
}

function buildIntakeChat(a: Answers): string {
  return `INTAKE — ${new Date().toLocaleDateString()}
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
Program: 4-day PPL+ (Push/Pull/Legs/Upper), chest & arms emphasis
`
}
