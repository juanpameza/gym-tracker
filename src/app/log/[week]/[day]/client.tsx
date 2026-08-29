'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { verdict, cycleRPE, type SetLog, type RPE } from '@/lib/progression'
import { isDayComplete, filledSets, type ExercisesMap, type WeekPrescriptions } from '@/lib/logs'
import type { Routine, Exercise } from '@/lib/routine'
import { calc1RM } from '@/lib/epley'
import StatBox from '@/components/StatBox'

// Best estimated 1RM for an exercise across a set list.
function bestEst(sets: SetLog[] | undefined): number | null {
  let best: number | null = null
  for (const s of sets ?? []) {
    const est = calc1RM(parseFloat(s.weight), parseInt(s.reps))
    if (est && (!best || est > best)) best = est
  }
  return best
}

function initExercises(
  dayKey: string,
  routine: Routine,
  existingExercises: ExercisesMap | null
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

function formatExport(
  weekNum: number,
  routine: Routine,
  weekData: Record<number, ExercisesMap>,
  prescribed: WeekPrescriptions,
  profile: Record<string, string>,
  targets: Record<string, number>
): string {
  const days = Object.keys(routine)
  const nextWeek = weekNum + 1
  const planWeight = (dayNum: number, ex: Exercise) => prescribed[dayNum]?.[ex.id] ?? ex.weight

  // ── Preamble: orient a fresh chat that has none of this app's context ──
  let text = 'You are my strength-training coach. Below is a full week from my workout log, '
  text += 'exported from my tracking app. I want you to review it and program the next week.\n\n'

  const who: string[] = []
  if (profile.experience) who.push(`${profile.experience} lifter`)
  if (profile.weight) who.push(`bodyweight ${profile.weight} lbs`)
  if (profile.height) who.push(profile.height)
  if (profile.split) who.push(`${profile.split} split`)
  if (profile.goal) who.push(`goal: ${profile.goal}`)
  if (profile.horizon) who.push(`horizon: ${profile.horizon}`)
  if (who.length) text += `ABOUT ME: ${who.join(' · ')}\n\n`

  text += 'HOW TO READ THIS LOG:\n'
  text += `• Each day lists its exercises. "Plan" is what week ${weekNum} prescribed; "Logged" is what I actually did.\n`
  text += '• Each logged set is weight×reps, with RPE in parentheses when recorded (e.g. 185×5 (8) = 185 lbs for 5 reps at RPE 8). '
  text += 'RPE scale: 7 = easy (~3 reps in reserve), 8 = solid (~2 in reserve), 9 = hard (~1 in reserve), 10 = max effort.\n'
  text += '• A dash (—) means the set was left blank / not completed. BW = bodyweight movement.\n'
  text += '• "Note:" lines are my own comments on that exercise (pain, form, equipment, how it felt).\n\n'

  text += `WEEK ${String(weekNum).padStart(2, '0')}\n`
  text += '════════════════════════════════════════\n\n'

  days.forEach((dk, i) => {
    const day = routine[dk]
    const dayNum = i + 1
    const exercises = weekData[dayNum]
    const logged = exercises && Object.keys(exercises).length > 0
    text += `DAY ${dayNum} — ${day.name.toUpperCase()}${day.meta ? ` (${day.meta})` : ''}${logged ? '' : '  [not logged]'}\n`
    text += '----------------------------------------\n'
    day.exercises.forEach(ex => {
      const plan = ex.unit === 'BW'
        ? `${ex.sets}×${ex.reps} BW`
        : `${ex.sets}×${ex.reps} @ ${planWeight(dayNum, ex)} lbs`
      const exData = exercises?.[ex.id]
      // A set with reps but no weight was done at the prescribed weight.
      const blankW = ex.unit === 'BW' ? 'BW' : String(exData?.prescribed ?? planWeight(dayNum, ex))
      const setStrs = exData
        ? exData.sets
            .map((s, idx) => {
              if (!s.reps) return `[${idx + 1}: —]`
              const rpe = s.rpe ? ` (${s.rpe})` : ''
              return `${s.weight || blankW}×${s.reps}${rpe}`
            })
            .join('  ')
        : '—'
      text += `${ex.name.padEnd(28)} Plan: ${plan.padEnd(18)} Logged: ${setStrs}\n`
      const note = exData?.note?.trim()
      if (note) text += `${''.padEnd(28)} Note: ${note.replace(/\s*\n+\s*/g, ' / ')}\n`
    })
    text += '\n'
  })

  // ── What I want back ──
  text += '════════════════════════════════════════\n'
  const goalStr = profile.horizon ? `my ${profile.horizon} goal` : 'my goal'
  text += `Please review week ${weekNum} and program week ${nextWeek} to keep me on track for ${goalStr}:\n`
  text += `1. Note where I hit, missed, or beat the plan, and flag anything concerning (stalls, big RPE jumps, skipped work, anything in my notes).\n`
  text += `2. Give me week ${nextWeek}'s prescribed weights/reps for each exercise, and briefly say why each changed.\n`
  text += `3. Call out any exercise I should swap, add, or drop.\n\n`

  // ── Machine-readable round-trip: Claude edits this and I paste it back into
  //    the app's Import screen. Weights here are THIS week's prescriptions (not
  //    the starting weights the routine was imported with), so Claude edits from
  //    the current state. Keeping ids/day keys stable is what preserves logged
  //    history and progression, so it is spelled out explicitly. ──
  const currentRoutine: Routine = Object.fromEntries(
    days.map((dk, i) => [
      dk,
      {
        ...routine[dk],
        exercises: routine[dk].exercises.map(ex => ({
          ...ex,
          qual: ex.qual ?? '',
          weight: ex.unit === 'BW' ? 0 : planWeight(i + 1, ex),
        })),
      },
    ])
  )
  text += '────────────────────────────────────────\n'
  text += 'THEN, so I can load your changes back into my app:\n'
  text += `Below is my current program as JSON, with each exercise's "weight" set to what week ${weekNum} prescribed. `
  text += `Return my UPDATED program for week ${nextWeek} as ONE json code block (fenced with triple backticks) in the exact same shape `
  text += '(a "routine" object of days → { name, meta, exercises[] }, each exercise having id, name, qual, sets, reps, weight, unit, progKey; '
  text += 'plus a "targets" object of exercise id → goal 1RM in lbs).\n'
  text += 'RULES: Keep every day key and every exercise "id" identical to below — that is what keeps my logged history and progression linked. '
  text += `Change sets/reps/weight (and targets, if warranted) to reflect week ${nextWeek}'s prescription. `
  text += 'If you swap a movement, reuse the same id in that slot. Do not invent new ids, rename keys, or drop the JSON block.\n\n'
  text += `MY CURRENT PROGRAM (week ${weekNum} weights):\n`
  text += '```json\n'
  text += JSON.stringify({ routine: currentRoutine, targets }, null, 2) + '\n'
  text += '```\n'
  return text
}

export function WorkoutLogClient({
  weekNum,
  dayNum,
  routine,
  programId,
  userId,
  profile,
  targets,
  existingExercises,
  priorExercises,
  weekExercises,
  prescribed,
}: {
  weekNum: number
  dayNum: number
  routine: Routine
  programId: string | null
  userId: string
  profile: Record<string, string>
  targets: Record<string, number>
  existingExercises: ExercisesMap | null
  priorExercises: ExercisesMap | null
  weekExercises: Record<number, ExercisesMap>
  prescribed: WeekPrescriptions
}) {
  const router = useRouter()
  const dayKey = `day${dayNum}`
  const day = routine[dayKey]

  const [exercises, setExercises] = useState<ExercisesMap>(() =>
    initExercises(dayKey, routine, existingExercises)
  )
  const [exportLabel, setExportLabel] = useState('▸ EXPORT WEEK SUMMARY')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Guards the session-completed activity so the debounced autosave fires it at most once per mount.
  const emittedRef = useRef(false)

  // On the FIRST completion of this (week, day), publish a feed activity.
  // The DB's partial unique index on workout_completed de-dupes across mounts;
  // a successful (non-conflict) insert means it's the genuine first completion,
  // so PRs are emitted in the same breath. All inserts are best-effort.
  const emitActivities = useCallback(
    async (data: ExercisesMap) => {
      try {
        const supabase = createClient()
        const totalVolume = Object.values(data)
          .flatMap(e => e.sets)
          .filter(s => s.reps && s.weight)
          .reduce((acc, s) => acc + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0)
        const setsDone = Object.values(data).reduce((acc, e) => acc + filledSets(e.sets), 0)
        const dayName = routine[`day${dayNum}`]?.name ?? `Day ${dayNum}`

        const { error } = await supabase.from('activities').insert({
          actor_id: userId,
          type: 'workout_completed',
          payload: { week: weekNum, day: dayNum, dayName, totalVolume, setsDone },
          visibility: 'friends',
        })
        // 23505 = already completed before; skip PRs to avoid re-announcing.
        if (error) return

        const day = routine[`day${dayNum}`]
        const prs = (day?.exercises ?? [])
          .filter(ex => ex.unit !== 'BW')
          .flatMap(ex => {
            const prior = bestEst(priorExercises?.[ex.id]?.sets)
            const cur = bestEst(data[ex.id]?.sets)
            if (prior && cur && cur > prior) {
              return [{
                actor_id: userId,
                type: 'pr_set' as const,
                payload: { exId: ex.id, exName: ex.name, est1rm: Math.round(cur), unit: ex.unit },
                visibility: 'friends' as const,
              }]
            }
            return []
          })
        if (prs.length) await supabase.from('activities').insert(prs)
      } catch {
        /* activity generation is non-fatal — the workout save is the source of truth */
      }
    },
    [userId, weekNum, dayNum, routine, priorExercises]
  )

  const saveLog = useCallback(
    async (data: ExercisesMap) => {
      const supabase = createClient()
      // Stamp what this session prescribed so blank-weight sets can be read
      // as "done at the prescribed weight" by next week's progression.
      const stamped: ExercisesMap = Object.fromEntries(
        Object.entries(data).map(([id, e]) => [id, { ...e, prescribed: prescribed[dayNum]?.[id] }])
      )
      await supabase.from('workout_logs').upsert(
        {
          user_id: userId,
          program_id: programId,
          week_num: weekNum,
          day_num: dayNum,
          logged_at: new Date().toISOString(),
          exercises: stamped,
        },
        { onConflict: 'user_id,program_id,week_num,day_num' }
      )

      // Fire the feed activity once the session is fully logged.
      if (!emittedRef.current && isDayComplete(routine[`day${dayNum}`], data)) {
        emittedRef.current = true
        emitActivities(data)
      }
    },
    [userId, programId, weekNum, dayNum, routine, prescribed, emitActivities]
  )

  function scheduleSave(next: ExercisesMap) {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveLog(next), 1200)
  }

  function handleInput(exId: string, setIdx: number, field: 'weight' | 'reps', value: string) {
    setExercises(prev => {
      const next = {
        ...prev,
        [exId]: {
          ...prev[exId],
          sets: prev[exId].sets.map((s, i) =>
            i === setIdx ? { ...s, [field]: value } : s
          ),
        },
      }
      scheduleSave(next)
      return next
    })
  }

  function handleRPE(exId: string, setIdx: number) {
    setExercises(prev => {
      const cur = prev[exId].sets[setIdx].rpe
      const next = {
        ...prev,
        [exId]: {
          ...prev[exId],
          sets: prev[exId].sets.map((s, i) =>
            i === setIdx ? { ...s, rpe: cycleRPE(cur) } : s
          ),
        },
      }
      scheduleSave(next)
      return next
    })
  }

  function handleNote(exId: string, value: string) {
    setExercises(prev => {
      const next = { ...prev, [exId]: { ...prev[exId], note: value } }
      scheduleSave(next)
      return next
    })
  }

  function handleExport() {
    // Merge the live current-day edits over the week's saved logs so the
    // export reflects unsaved input for the day being worked on right now.
    const weekData = { ...weekExercises, [dayNum]: exercises }
    const text = formatExport(weekNum, routine, weekData, prescribed, profile, targets)
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
  const completedSets = Object.values(exercises).reduce((acc, e) => acc + filledSets(e.sets), 0)
  const totalVolume = Object.values(exercises)
    .flatMap(e => e.sets)
    .filter(s => s.reps && s.weight)
    .reduce((acc, s) => acc + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0)
  const dayDone = isDayComplete(day, exercises)

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

        {/* Day tabs — ✓ once every prescribed set of that day has reps logged.
            The active day is judged from live state so the tick appears as you finish. */}
        <div
          className="grid gap-2 mb-6"
          style={{ gridTemplateColumns: `repeat(${dayKeys.length}, minmax(0, 1fr))` }}
        >
          {dayKeys.map((dk, i) => {
            const dn = i + 1
            const isActive = dn === dayNum
            const complete = isDayComplete(routine[dk], isActive ? exercises : weekExercises[dn])
            return (
              <button
                key={dk}
                onClick={() => router.push(`/log/${weekNum}/${dn}`)}
                className={`border py-3 px-1 text-center text-[10px] tracking-[0.12em] font-bold transition-all cursor-pointer relative
                  ${isActive
                    ? 'bg-[#d9a441] border-[#d9a441] text-[#1a1a17]'
                    : complete
                    ? 'border-[#4a9b5e] bg-[rgba(74,155,94,0.05)] text-[#4a9b5e] hover:border-[#f4ede0] hover:text-[#f4ede0]'
                    : 'border-[#2a2a25] text-[#6b6a62] hover:border-[#f4ede0] hover:text-[#f4ede0]'
                  }`}
              >
                {complete && (
                  <span className={`absolute top-1 right-1.5 text-[11px] leading-none ${isActive ? 'text-[#1a1a17]' : 'text-[#4a9b5e]'}`}>
                    ✓
                  </span>
                )}
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
          return (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              sets={exData.sets}
              note={exData.note ?? ''}
              prescribed={prescribed[dayNum]?.[ex.id] ?? ex.weight}
              onInput={(setIdx, field, val) => handleInput(ex.id, setIdx, field, val)}
              onRPE={setIdx => handleRPE(ex.id, setIdx)}
              onNote={val => handleNote(ex.id, val)}
            />
          )
        })}

        {/* Summary panel */}
        <div className="mt-8 border-2 border-[#f4ede0] p-5 bg-[linear-gradient(180deg,rgba(217,164,65,0.04),transparent)]">
          <h2 className="font-display font-black text-xl mb-4 flex items-baseline gap-3 flex-wrap">
            Session Summary
            {dayDone && (
              <span className="font-mono font-bold text-[10px] tracking-[0.2em] text-[#4a9b5e] uppercase">✓ Day complete</span>
            )}
          </h2>
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
  ex, sets, note, prescribed, onInput, onRPE, onNote,
}: {
  ex: Exercise
  sets: SetLog[]
  note: string
  prescribed: number
  onInput: (setIdx: number, field: 'weight' | 'reps', val: string) => void
  onRPE: (setIdx: number) => void
  onNote: (val: string) => void
}) {
  // The note field stays tucked away until asked for (or already written).
  const [noteOpen, setNoteOpen] = useState(false)
  const allFilled = sets.length > 0 && filledSets(sets) === sets.length
  const v = allFilled ? verdict(ex.progKey, ex.reps, prescribed, ex.unit, sets, ex.sets) : null
  const targetDisplay = ex.unit === 'BW' ? 'bodyweight' : `${prescribed} ${ex.unit}`
  const showNote = noteOpen || note.length > 0

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

      {/* Optional per-exercise note — goes into the week export for Claude. */}
      <div className="mt-2.5">
        {showNote ? (
          <textarea
            autoFocus={noteOpen}
            value={note}
            onChange={e => onNote(e.target.value)}
            rows={2}
            placeholder="Note — pain, form cues, equipment, how it felt…"
            className="w-full bg-transparent border border-[#2a2a25] focus:border-[#d9a441] text-[#f4ede0] text-[12px] leading-relaxed p-2 outline-none transition-colors placeholder:text-[#3a3a32] resize-y"
          />
        ) : (
          <button
            onClick={() => setNoteOpen(true)}
            className="text-[9px] tracking-[0.2em] text-[#6b6a62] hover:text-[#f4ede0] uppercase cursor-pointer transition-colors"
          >
            + Note
          </button>
        )}
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
              {v.direction === 'hold' && <>· Keep <strong className="text-[#f4ede0]">{v.nextW} lbs</strong></>}
              {v.direction === 'down' && <>→ Drop to <strong className="text-[#f4ede0]">{v.nextW} lbs</strong></>}
              {v.anchor !== prescribed && (
                <span className="ml-1 text-[#6b6a62]">(plan was {prescribed})</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// RPE 7 green → 8 amber → 9 orange → 10 red.
const RPE_STYLE: Record<Exclude<RPE, null>, string> = {
  7: 'border-[#4a9b5e] text-[#4a9b5e] bg-[rgba(74,155,94,0.08)]',
  8: 'border-[#d9a441] text-[#d9a441] bg-[rgba(217,164,65,0.08)]',
  9: 'border-[#e0762b] text-[#e0762b] bg-[rgba(224,118,43,0.08)]',
  10: 'border-[#c8311a] text-[#c8311a] bg-[rgba(200,49,26,0.08)]',
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
  const rpeLabel = set.rpe ? `RPE ${set.rpe}` : '— RPE'
  const rpeClass = set.rpe ? RPE_STYLE[set.rpe] : 'border-[#2a2a25] text-[#6b6a62]'

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
        className={`border text-[11px] font-bold py-2 px-1 text-center transition-all cursor-pointer whitespace-nowrap ${rpeClass}`}
      >
        {rpeLabel}
      </button>
    </div>
  )
}
