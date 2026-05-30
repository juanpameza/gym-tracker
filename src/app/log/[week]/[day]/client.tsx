'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { nextWeight, verdict, cycleRPE, type SetLog, type RPE } from '@/lib/progression'
import type { Routine, Exercise } from '@/lib/routine'

type ExercisesMap = Record<string, { sets: SetLog[] }>

function initExercises(
  dayKey: string,
  routine: Routine,
  existingExercises: ExercisesMap | null,
  priorExercises: ExercisesMap | null
): ExercisesMap {
  const day = routine[dayKey]
  if (!day) return {}

  const result: ExercisesMap = {}
  for (const ex of day.exercises) {
    if (existingExercises?.[ex.id]) {
      result[ex.id] = existingExercises[ex.id]
    } else {
      result[ex.id] = {
        sets: Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', rpe: null })),
      }
    }
  }
  return result
}

function getPrescribed(ex: Exercise, priorExercises: ExercisesMap | null): number {
  if (!priorExercises?.[ex.id]) return ex.weight
  const priorSets = priorExercises[ex.id].sets
  return nextWeight(ex.progKey, ex.reps, ex.weight, ex.unit, priorSets)
}

function formatExport(weekNum: number, routine: Routine, exercises: ExercisesMap, profile: Record<string, string>): string {
  const days = Object.keys(routine)
  const weightStr = profile.weight ? `${profile.weight} LBS` : ''
  const splitStr = profile.split ?? ''
  const header = [weightStr, splitStr].filter(Boolean).join(' / ')
  let text = `WEEK ${String(weekNum).padStart(2, '0')} — ${header}\n`
  text += '════════════════════════════════════════\n\n'
  days.forEach((dk, i) => {
    const day = routine[dk]
    text += `DAY ${i + 1} — ${day.name.toUpperCase()} (${day.meta})\n`
    text += '----------------------------------------\n'
    day.exercises.forEach(ex => {
      const exData = exercises[ex.id]
      if (!exData) return
      const setStrs = exData.sets
        .map((s, idx) => {
          if (!s.reps) return `[${idx + 1}: —]`
          const rpe = s.rpe ? ` (${s.rpe})` : ''
          return `${s.weight || '?'}×${s.reps}${rpe}`
        })
        .join('  ')
      text += `${ex.name.padEnd(34)} ${setStrs}\n`
    })
    text += '\n'
  })
  const nextWeek = weekNum + 1
  const context = [profile.split, profile.experience, profile.goal, profile.horizon].filter(Boolean).join(', ')
  text += '════════════════════════════════════════\n'
  const goalStr = profile.horizon ? `my ${profile.horizon} goal` : 'my goal'
  text += `Claude — review week ${weekNum} and adjust week ${nextWeek} if needed. Keep me on track for ${goalStr}.\n`
  if (context) text += `[Context: ${context}]`
  return text
}

export function WorkoutLogClient({
  weekNum,
  dayNum,
  routine,
  programId,
  userId,
  profile,
  existingExercises,
  priorExercises,
}: {
  weekNum: number
  dayNum: number
  routine: Routine
  programId: string | null
  userId: string
  profile: Record<string, string>
  existingExercises: ExercisesMap | null
  priorExercises: ExercisesMap | null
}) {
  const router = useRouter()
  const dayKey = `day${dayNum}`
  const day = routine[dayKey]

  const [exercises, setExercises] = useState<ExercisesMap>(() =>
    initExercises(dayKey, routine, existingExercises, priorExercises)
  )
  const [exportLabel, setExportLabel] = useState('▸ EXPORT WEEK SUMMARY')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const saveLog = useCallback(
    async (data: ExercisesMap) => {
      const supabase = createClient()
      await supabase.from('workout_logs').upsert(
        {
          user_id: userId,
          program_id: programId,
          week_num: weekNum,
          day_num: dayNum,
          logged_at: new Date().toISOString(),
          exercises: data,
        },
        { onConflict: 'user_id,program_id,week_num,day_num' }
      )
    },
    [userId, programId, weekNum, dayNum]
  )

  function handleInput(exId: string, setIdx: number, field: 'weight' | 'reps', value: string) {
    setExercises(prev => {
      const next = {
        ...prev,
        [exId]: {
          sets: prev[exId].sets.map((s, i) =>
            i === setIdx ? { ...s, [field]: value } : s
          ),
        },
      }
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => saveLog(next), 1200)
      return next
    })
  }

  function handleRPE(exId: string, setIdx: number) {
    setExercises(prev => {
      const cur = prev[exId].sets[setIdx].rpe
      const next = {
        ...prev,
        [exId]: {
          sets: prev[exId].sets.map((s, i) =>
            i === setIdx ? { ...s, rpe: cycleRPE(cur) } : s
          ),
        },
      }
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => saveLog(next), 1200)
      return next
    })
  }

  function handleExport() {
    const text = formatExport(weekNum, routine, exercises, profile)
    const copy = () => {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => flash())
    } else {
      copy()
      flash()
    }
  }

  function flash() {
    setExportLabel('✓ COPIED TO CLIPBOARD')
    setTimeout(() => setExportLabel('▸ EXPORT WEEK SUMMARY'), 2000)
  }

  const dayKeys = Object.keys(routine)

  if (!day) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-[#c8311a] font-display font-black text-2xl mb-3">
            {dayKeys.length === 0 ? 'No program yet.' : 'Day not found.'}
          </p>
          <p className="text-[13px] text-[#6b6a62] mb-6">
            {dayKeys.length === 0
              ? 'Import your personalized program before logging workouts.'
              : 'That day is not part of your routine.'}
          </p>
          <button
            onClick={() => router.push(dayKeys.length === 0 ? '/import' : '/')}
            className="border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-3 px-6 transition-all cursor-pointer"
          >
            {dayKeys.length === 0 ? '▸ IMPORT PROGRAM' : '▸ DASHBOARD'}
          </button>
        </div>
      </div>
    )
  }
  const completedSets = Object.values(exercises).flatMap(e => e.sets).filter(s => s.reps !== '').length
  const totalVolume = Object.values(exercises)
    .flatMap(e => e.sets)
    .filter(s => s.reps && s.weight)
    .reduce((acc, s) => acc + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0)

  return (
    <div
      className="min-h-screen px-4 py-6 pb-24"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at top left, rgba(217,164,65,0.06), transparent 50%), radial-gradient(ellipse at bottom right, rgba(200,49,26,0.05), transparent 50%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="border-2 border-[#f4ede0] p-5 mb-6 relative bg-[rgba(244,237,224,0.02)]">
          <div className="absolute -top-3 right-5 bg-[#0e0e0c] px-2 text-[10px] tracking-[0.2em] text-[#d9a441]">
            FORM {String(weekNum).padStart(2, '0')}
          </div>
          <div className="border border-[#c8311a] text-[#c8311a] inline-block px-2 py-1 text-[10px] tracking-[0.25em] mb-3 -rotate-1 font-bold">
            ★ WEEK {String(weekNum).padStart(2, '0')} / PHASE 01 ★
          </div>
          <h1 className="font-display font-black leading-none text-4xl">
            TRAINING <span className="text-[#d9a441] italic">LOG.</span>
          </h1>
          <div className="text-[11px] tracking-[0.2em] text-[#6b6a62] uppercase mt-3 border-t border-dashed border-[#2a2a25] pt-3 flex justify-between flex-wrap gap-2">
            <span>{[profile.weight ? `${profile.weight} LBS` : null, profile.split, profile.experience].filter(Boolean).join(' / ') || 'TRAINING LOG'}</span>
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</span>
          </div>
        </header>

        {/* Day tabs */}
        <div
          className="grid gap-2 mb-6"
          style={{ gridTemplateColumns: `repeat(${dayKeys.length}, minmax(0, 1fr))` }}
        >
          {dayKeys.map((dk, i) => {
            const dn = i + 1
            const isActive = dn === dayNum
            const isComplete = dn !== dayNum && existingExercises && dk === dayKey
            return (
              <button
                key={dk}
                onClick={() => router.push(`/log/${weekNum}/${dn}`)}
                className={`border py-3 px-1 text-center text-[10px] tracking-[0.12em] font-bold transition-all cursor-pointer relative
                  ${isActive
                    ? 'bg-[#d9a441] border-[#d9a441] text-[#1a1a17]'
                    : 'border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
                  }`}
              >
                <span className="font-display text-2xl font-black block mb-0.5 leading-none">{dn}</span>
                {routine[dk]?.name.toUpperCase()}
              </button>
            )
          })}
        </div>

        {/* Day title */}
        <div className="font-display text-3xl font-black mb-1">
          Day {dayNum} — {day.name}
        </div>
        <div className="text-[10px] text-[#6b6a62] tracking-[0.2em] uppercase mb-5 pb-4 border-b border-[#2a2a25]">
          {day.meta}
        </div>

        {/* Exercises */}
        {day.exercises.map(ex => {
          const exData = exercises[ex.id] ?? { sets: [] }
          const prescribed = getPrescribed(ex, priorExercises)
          return (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              sets={exData.sets}
              prescribed={prescribed}
              onInput={(setIdx, field, val) => handleInput(ex.id, setIdx, field, val)}
              onRPE={setIdx => handleRPE(ex.id, setIdx)}
            />
          )
        })}

        {/* Summary panel */}
        <div className="mt-8 border-2 border-[#f4ede0] p-5 bg-[linear-gradient(180deg,rgba(217,164,65,0.04),transparent)]">
          <h2 className="font-display font-black text-xl mb-4">Session Summary</h2>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatBox label="Sets Done" value={String(completedSets)} />
            <StatBox label="Volume (lbs)" value={totalVolume.toLocaleString()} />
            <StatBox label="Week" value={`${weekNum}`} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleExport}
              className="flex-1 min-w-[140px] bg-[#c8311a] hover:bg-[#d9a441] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer"
            >
              {exportLabel}
            </button>
            <button
              onClick={() => router.push(`/log/${weekNum + 1}/1`)}
              className="flex-1 min-w-[140px] border border-[#f4ede0] hover:bg-[#f4ede0] hover:text-[#1a1a17] text-[#f4ede0] font-bold tracking-[0.2em] text-[11px] uppercase py-4 transition-all cursor-pointer"
            >
              ▸ WEEK {weekNum + 1}
            </button>
          </div>
        </div>

        <footer className="mt-12 text-center text-[10px] text-[#6b6a62] tracking-[0.3em]">
          // END FORM {String(weekNum).padStart(2, '0')} //
        </footer>
      </div>
    </div>
  )
}

function ExerciseCard({
  ex, sets, prescribed, onInput, onRPE,
}: {
  ex: Exercise
  sets: SetLog[]
  prescribed: number
  onInput: (setIdx: number, field: 'weight' | 'reps', val: string) => void
  onRPE: (setIdx: number) => void
}) {
  const allFilled = sets.filter(s => s.reps !== '').length === sets.length
  const v = allFilled ? verdict(ex.progKey, ex.reps, prescribed, ex.unit, sets, ex.sets) : null
  const targetDisplay = ex.unit === 'BW' ? 'bodyweight' : `${prescribed} ${ex.unit}`

  return (
    <div
      className={`border p-4 mb-3 transition-colors ${allFilled ? 'border-[#4a9b5e] bg-[rgba(74,155,94,0.04)]' : 'border-[#2a2a25] hover:border-[#3a3a32]'}`}
    >
      <div className="flex justify-between items-start mb-3 gap-3 flex-wrap">
        <div>
          <span className="font-display text-[18px] font-bold leading-tight">{ex.name}</span>
          {ex.qual && <span className="text-[10px] text-[#6b6a62] ml-1.5">{ex.qual}</span>}
        </div>
        <div className="text-[10px] text-[#d9a441] tracking-[0.15em] uppercase whitespace-nowrap">
          {ex.sets} × {ex.reps} @{' '}
          <span className="text-[#f4ede0] font-bold">{targetDisplay}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-1.5 text-[9px] tracking-[0.2em] text-[#6b6a62] uppercase">
        <span>#</span><span>Weight</span><span>Reps</span><span>RPE</span>
      </div>

      <div className="space-y-1.5">
        {sets.map((s, idx) => (
          <SetRow
            key={idx}
            idx={idx}
            set={s}
            prescribed={prescribed}
            unit={ex.unit}
            onInput={(field, val) => onInput(idx, field, val)}
            onRPE={() => onRPE(idx)}
          />
        ))}
      </div>

      {v && (
        <div className="mt-3 pt-2 border-t border-dashed border-[#2a2a25] text-[11px] tracking-[0.05em] text-[#6b6a62]">
          <span
            className={`font-bold tracking-[0.1em] uppercase ${
              v.direction === 'up' ? 'text-[#4a9b5e]' : v.direction === 'down' ? 'text-[#c8311a]' : 'text-[#d9a441]'
            }`}
          >
            {v.label}
          </span>
          {ex.unit !== 'BW' && (
            <span className="ml-2">
              {v.direction === 'up' && <>→ <strong className="text-[#f4ede0]">{v.nextW} lbs</strong> next session</>}
              {v.direction === 'hold' && <>· Keep <strong className="text-[#f4ede0]">{prescribed} lbs</strong></>}
              {v.direction === 'down' && <>→ Drop to <strong className="text-[#f4ede0]">{v.nextW} lbs</strong></>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function SetRow({
  idx, set, prescribed, unit, onInput, onRPE,
}: {
  idx: number
  set: SetLog
  prescribed: number
  unit: string
  onInput: (field: 'weight' | 'reps', val: string) => void
  onRPE: () => void
}) {
  const rpeLabel = set.rpe === 'easy' ? 'EASY' : set.rpe === 'perfect' ? '8 RPE' : set.rpe === 'hard' ? 'HARD' : '— RPE'
  const rpeClass =
    set.rpe === 'easy'
      ? 'border-[#4a9b5e] text-[#4a9b5e]'
      : set.rpe === 'perfect'
      ? 'border-[#d9a441] text-[#d9a441] bg-[rgba(217,164,65,0.08)]'
      : set.rpe === 'hard'
      ? 'border-[#c8311a] text-[#c8311a]'
      : 'border-[#2a2a25] text-[#6b6a62]'

  return (
    <div className="grid grid-cols-4 gap-2 items-center">
      <span className="text-[10px] text-[#6b6a62] font-bold tracking-[0.1em]">{idx + 1}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          placeholder={unit === 'BW' ? 'BW' : String(prescribed)}
          value={set.weight}
          onChange={e => onInput('weight', e.target.value)}
          className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[15px] font-medium py-2 px-2.5 pr-8 outline-none transition-colors"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#6b6a62] pointer-events-none tracking-[0.1em]">
          {unit === 'BW' ? 'BW' : 'LBS'}
        </span>
      </div>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          placeholder="—"
          value={set.reps}
          onChange={e => onInput('reps', e.target.value)}
          className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[15px] font-medium py-2 px-2.5 pr-10 outline-none transition-colors"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#6b6a62] pointer-events-none tracking-[0.1em]">
          REPS
        </span>
      </div>
      <button
        onClick={onRPE}
        className={`border text-[11px] font-bold py-2 px-1 text-center transition-all cursor-pointer ${rpeClass}`}
      >
        {rpeLabel}
      </button>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#2a2a25] p-3 text-center">
      <div className="font-display text-3xl font-black text-[#d9a441] leading-none">{value}</div>
      <div className="text-[9px] tracking-[0.2em] text-[#6b6a62] uppercase mt-1.5">{label}</div>
    </div>
  )
}
