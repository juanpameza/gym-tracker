These are some random bugs/quirks we've already discussed:

Bug fix (the face pull problem): Recommendations now anchor on your heaviest actually-lifted weight, not the prescribed weight. So if face pulls say 70 lbs but you load 90 and crush it, the system reads from 90 and suggests the next step from there.

Per-set logging: You log each set individually with weight, reps, and a tap-to-select RPE (Easy / Perfect / Hard). Mid-workout weight bumps get captured naturally — just type the heavier number on the later sets.

Live progression hints: As soon as all sets of an exercise are logged, the card shows the next-session target with color-coded direction (↑ green = progress, → amber = hold, ↓ red = deload). No waiting until end of week to know what comes next.
The progression logic:
- All top-weight sets EASY + hit max reps → +10 lbs (or +5 for small lifts ≤50)
- Mostly PERFECT, hit max reps → +5 lbs (or +2.5 small)
- Any HARD on top-weight sets → hold
- Reps below minimum → drop 10%
- Small lifts (≤50 lbs) progress in 2.5 lb increments (microplates)
- Bodyweight exercises advance reps, not weight

RPE is a single tap-to-cycle button per set: RPE → EASY (green) → PERFECT (amber) → HARD (red) → RPE. Each tap advances to the next state; if you overshoot, just keep tapping to come back around.

Recognize when set 1 is meaningfully heavier than the rest. Current logic only looks at the anchor (last set). New logic should also check: "did you successfully complete the prescribed reps at a heavier weight earlier?"
Three buckets:
Pattern | Interpretation | Next Session
Heavy set 1 hit reps, then dropped & finished | Strength is there, capacity isn't yet | Split — go halfway between (e.g. 35 + 30 → 32.5)
Heavy set 1 missed reps, then dropped | Truly too heavy | Hold at the drop weight
Started light, bumped up | Found real ceiling | Anchor on last set

Decision tree:
Pattern | Verdict
Heavy set hit reps, dropped, anchor hit max reps | Midpoint progress (35→30 → 32.5)
Heavy set hit reps, dropped, anchor didn't max | Hold at anchor
Heavy set missed reps, dropped | Hold at anchor
Anchor HARD with no heavier sets | Hold
Started light, bumped upAnchor on final, progress normally
All sets same, all easy | Big bump (+10 or +5)
All sets same, perfect | Standard bump (+5 or +2.5)

---

## Progression rules v2 (2026-08-29) — RPE 7–10

RPE is now a 7–10 scale per set (7 green · 8 amber · 9 orange · 10 red). Legacy easy/perfect/hard logs read as 7/8/9. Implemented in `src/lib/progression.ts` (`decide`).

Three inputs per exercise: the weight actually lifted, reps per set vs the range, RPE per set. "Delta weight" (actual vs prescribed) is NOT a trigger — the actual weight is just the anchor the rules run from; the verdict's arrow is relative to that anchor and the card shows the plan for context.

```
0. Anchor = weight of the last logged set. Blank weight = the prescribed weight.
   Earlier LIGHTER sets are ignored (started light, bumped up).
   Earlier HEAVIER sets (loaded heavy, then dropped):
     anchor sets under range                          → DELOAD  anchor × 0.9
     heavier sets hit min reps AND anchor sets at top → PROGRESS to the midpoint
     otherwise                                        → HOLD    at anchor
1. Any anchor set below the rep range      → DELOAD   anchor × 0.9
2. Not every anchor set at top of range    → HOLD     anchor   (any RPE — chase reps)
3. Every anchor set at top of range:
   a. ≥2 sets at RPE 10, or fixed reps ("5") with any RPE 10  → HOLD
      (one RPE-10 set is normal fatigue; the rep range is the cushion that
       absorbs +inc — a fixed rep target has no cushion)
   b. ≥2 sets at RPE 7 and no set ≥ 9                          → JUMP     +2×inc
   c. otherwise (8s, 9s, a single 10, unrecorded)              → PROGRESS +inc
Unrecorded RPE is neutral (counts as 8).
```

Worked example: 50 lb isolation, 8–10 reps, 10/10/10 @ RPE 8, 9, 10 → PROGRESS to 52.5 (the drop back to 8 reps absorbs the increment).