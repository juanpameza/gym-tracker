import type { ProgKey } from './progression'

export interface Exercise {
  id: string
  name: string
  qual?: string
  sets: number
  reps: string
  weight: number
  unit: 'lbs' | 'BW'
  progKey: ProgKey
}

export interface DayRoutine {
  name: string
  meta: string
  exercises: Exercise[]
}

export type Routine = Record<string, DayRoutine>

export const DEFAULT_ROUTINE: Routine = {
  day1: {
    name: 'Push',
    meta: 'Chest · Shoulders · Triceps',
    exercises: [
      { id: 'bench',  name: 'Barbell Bench Press',         sets: 4, reps: '6-8',   weight: 95,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'incdb',  name: 'Incline DB Press', qual: '(per hand)', sets: 3, reps: '8-10',  weight: 35,   unit: 'lbs', progKey: 'accessory'            },
      { id: 'ohp',    name: 'Seated OHP (barbell)',         sets: 3, reps: '8-10',  weight: 40,   unit: 'lbs', progKey: 'compound-upper-small'  },
      { id: 'cfly',   name: 'Cable Chest Fly', qual: '(per side)', sets: 3, reps: '12-15', weight: 17.5, unit: 'lbs', progKey: 'isolation'            },
      { id: 'rope',   name: 'Triceps Rope Pushdown',        sets: 3, reps: '10-12', weight: 30,   unit: 'lbs', progKey: 'isolation'            },
      { id: 'ohte',   name: 'Overhead Triceps Extension',   sets: 3, reps: '10-12', weight: 25,   unit: 'lbs', progKey: 'isolation'            },
    ],
  },
  day2: {
    name: 'Pull',
    meta: 'Back · Biceps',
    exercises: [
      { id: 'brow',   name: 'Barbell Row',                  sets: 4, reps: '6-8',   weight: 80,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'lpd',    name: 'Lat Pulldown',                  sets: 3, reps: '8-10',  weight: 90,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'scr',    name: 'Seated Cable Row',              sets: 3, reps: '10-12', weight: 80,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'fp',     name: 'Face Pulls',                    sets: 3, reps: '12-15', weight: 30,   unit: 'lbs', progKey: 'isolation'            },
      { id: 'bcurl',  name: 'Barbell Curl',                  sets: 3, reps: '8-10',  weight: 30,   unit: 'lbs', progKey: 'compound-upper-small'  },
      { id: 'hcurl',  name: 'Hammer Curl', qual: '(per hand)', sets: 3, reps: '10-12', weight: 20, unit: 'lbs', progKey: 'isolation'            },
    ],
  },
  day3: {
    name: 'Legs',
    meta: 'Quads · Hamstrings · Calves',
    exercises: [
      { id: 'sq',     name: 'Back Squat',                   sets: 4, reps: '6-8',   weight: 95,   unit: 'lbs', progKey: 'compound-lower'       },
      { id: 'rdl',    name: 'Romanian Deadlift',            sets: 3, reps: '8-10',  weight: 95,   unit: 'lbs', progKey: 'compound-lower'       },
      { id: 'lp',     name: 'Leg Press', qual: '(machine total)', sets: 3, reps: '10-12', weight: 180, unit: 'lbs', progKey: 'compound-lower'  },
      { id: 'lc',     name: 'Leg Curl (machine)',           sets: 3, reps: '10-12', weight: 50,   unit: 'lbs', progKey: 'isolation'            },
      { id: 'cr',     name: 'Standing Calf Raise',          sets: 4, reps: '10-15', weight: 90,   unit: 'lbs', progKey: 'isolation'            },
      { id: 'hkr',    name: 'Hanging Knee Raise', qual: '(bodyweight)', sets: 3, reps: '10-15', weight: 0, unit: 'BW', progKey: 'bodyweight'  },
    ],
  },
  day4: {
    name: 'Upper',
    meta: 'Chest + Arms Emphasis',
    exercises: [
      { id: 'incbp',  name: 'Incline Barbell Press',        sets: 4, reps: '6-8',   weight: 75,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'mcp',    name: 'Machine Chest Press',          sets: 3, reps: '8-10',  weight: 60,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'cfly2',  name: 'Cable Fly (low-to-high)', qual: '(per side)', sets: 3, reps: '12-15', weight: 15, unit: 'lbs', progKey: 'isolation' },
      { id: 'cgbp',   name: 'Close-Grip Bench Press',       sets: 3, reps: '8-10',  weight: 75,   unit: 'lbs', progKey: 'compound-upper'       },
      { id: 'idbc',   name: 'Incline DB Curl', qual: '(per hand)', sets: 3, reps: '8-10', weight: 15, unit: 'lbs', progKey: 'isolation'       },
      { id: 'sscurl', name: 'Cable Curl + Pushdown Superset', sets: 3, reps: '12 each', weight: 25, unit: 'lbs', progKey: 'isolation'          },
      { id: 'lr',     name: 'Lateral Raise', qual: '(per hand)', sets: 3, reps: '12-15', weight: 10, unit: 'lbs', progKey: 'isolation'        },
    ],
  },
}

export const STRENGTH_TARGETS: Record<string, number> = {
  bench: 205,
  ohp: 125,
  squat: 245,
  rdl: 245,
  row: 175,
  incline: 165,
  curl: 90,
}

export const DAY0_EXERCISES = [
  { id: 'bench',   name: 'Barbell Bench Press', protocol: 'Top set · 5 reps @ RPE 8', targetReps: 5, session: 'A' as const, target1rm: STRENGTH_TARGETS.bench   },
  { id: 'ohp',     name: 'Overhead Press',       protocol: 'Top set · 5 reps @ RPE 8', targetReps: 5, session: 'A' as const, target1rm: STRENGTH_TARGETS.ohp     },
  { id: 'incline', name: 'Incline DB Press',     protocol: 'Top set · 8 reps @ RPE 8', targetReps: 8, session: 'A' as const, target1rm: STRENGTH_TARGETS.incline  },
  { id: 'squat',   name: 'Back Squat',           protocol: 'Top set · 5 reps @ RPE 8', targetReps: 5, session: 'B' as const, target1rm: STRENGTH_TARGETS.squat   },
  { id: 'rdl',     name: 'Romanian Deadlift',    protocol: 'Top set · 8 reps @ RPE 8', targetReps: 8, session: 'B' as const, target1rm: STRENGTH_TARGETS.rdl     },
  { id: 'row',     name: 'Barbell Row',          protocol: 'Top set · 8 reps @ RPE 8', targetReps: 8, session: 'B' as const, target1rm: STRENGTH_TARGETS.row     },
  { id: 'curl',    name: 'Barbell Curl',         protocol: 'Top set · 8 reps @ RPE 8', targetReps: 8, session: 'B' as const, target1rm: STRENGTH_TARGETS.curl    },
]
