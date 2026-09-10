# Build prompt: Ironman 70.3 Valencia Tracker

Use this document as the build spec when applying it to a chosen web app template/starter. It describes **what** the app must do and **how it must behave**, not which framework, database, or hosting stack to use — pick whatever the template already provides and implement the requirements below on top of it.

There is no companion seed-data file: this app starts empty. Everything it needs to be configured with — the training-type catalogue, the key dates, the race targets — is listed inline in section 6 and must be built in as fixed configuration.

---

## 1. Project pitch

Tom and Quirijn are training for the **Ironman 70.3 Valencia on Sunday 18 April 2027**, goal: **finish under 5 hours**. This is their shared training tracker, and it does two things:

1. **Agenda** — a drag-and-drop training calendar running September 2026 through April 2027. They plan sessions from a palette of training types, then fill in what they actually achieved (time, distance, heart rate, RPE). From October onward, every endurance session carries a personal weekly pace target that ratchets from their own September baseline toward race pace.
2. **Dashboard** — an analysis view that turns the logged sessions into a **predicted race finish time** with splits, per-discipline form and trends, training volume and consistency, a weekly Garmin check-in, and a written summary in Dutch telling them what to fix.

It is a private tool for exactly two people. It is not a general-purpose training app, has no social features, and does not need to support other races or other users.

## 2. Non-negotiable constraints

- **All UI text and content must be Dutch**, in an informal tone (`je`/`jullie`, not `u`). Every label, button, placeholder, empty state and generated sentence is Nederlandstalig. Only this build prompt is in English.
- **The tone and the in-jokes are deliberate.** The app tracks, per week, three side activities with emoji: 🧘 `rek` (stretching sessions), 🍺 `zuipen` (nights out drinking), 🍆 `geneukt` (sex). A "🐼 panda counter" per person is derived from the last one. **Do not sanitise, rename, soften, hide, or "professionalise" any of this** — it is the point of the app for its two users. Keep the emoji and the labels exactly as specified.
- **Data must persist server-side and be shared** between both users. Tom logging a session on his phone must show up on Quirijn's laptop, and each of them can see and edit the other's data. Local-only browser storage is explicitly not sufficient.
- **No real-time requirement.** Refresh-on-navigation, or polling every 30–60s while the tab is visible, is enough. No websockets or live sync.
- **"Last write wins" is acceptable** conflict resolution. No merge logic, no per-field conflict UI.
- **One shared password is sufficient authentication** for the whole app. Per-user accounts, roles, or SSO are explicitly **not** required — both users are effectively the same account, and the person switcher (section 3) is a *view* control, not a permission boundary.
- **Never lose an edit silently.** The header carries a save-state indicator with the states `·` (idle), `⏳ opslaan…`, `✓ opgeslagen`, `✓ geladen`, `⚠️ fout bij opslaan`. If a save fails, the UI must say so and the user's input must remain visible and recoverable in their own browser.
- **One-time migration path.** The app must accept an upload of a JSON file in exactly the shape of section 5 and merge it into the stored data (per-record merge: incoming workouts overwrite by id; incoming weekly/garmin records overwrite by person + week key; nothing else is touched). This is how the existing users' localStorage data from the previous version gets in. It is a one-time utility, not a feature that needs to be prominent.

## 3. Users & views

There are exactly two people, hard-coded: `tom` → "Tom", `quirijn` → "Quirijn". These are stable identifiers used as the join key for all data; the display names may be shown anywhere but the keys never change.

Two orthogonal switchers, both always visible in the header:
- **Person tabs** — Tom / Quirijn. Switches *whose* data the whole app shows and edits. The selected person persists across sessions in that browser (this is a per-device preference, not shared data).
- **View tabs** — 📅 Agenda / 📊 Dashboard.

## 4. Information architecture

**Header** (dark navy, always at the top):
- Title `🏊🚴🏃 IRONMAN 70.3 VALENCIA` with the subline `Zondag 18 april 2027 · doel: onder de 5 uur`.
- A **live countdown** to the race in four boxes: `dagen` / `uur` / `min` / `sec`, ticking every second, hours/minutes/seconds zero-padded. When the race moment has passed, the countdown is replaced by a single `🏁 RACE DAY` box.
- The **panda counters** for both people side by side: `🐼 Tom: +3` / `🐼 Quirijn: −1` — always signed, both shown regardless of which person is selected.
- Person tabs, view tabs, and the save-state indicator.

**Context banner** — a single strip below the header, shown only in the Agenda view, whose content depends on the month being viewed (see section 7).

**Agenda view** — two columns on desktop: a sticky training palette on the left (~215px) and the month calendar filling the rest. Below the palette sits a collapsible explainer `🎯 Hoe werken de targets?` containing the race-goal reference table from section 6.

**Dashboard view** — a responsive card grid (cards ~300px minimum, auto-fitting), with the finish-time card spanning the full width at the top and the written analysis spanning the full width at the bottom.

**Workout modal** — a centred overlay dialog for editing one session; closes on backdrop click.

## 5. Data model

Three collections, all keyed by person. If the template offers a real database, model these as three tables (`workouts`, `weekly`, `garmin`) rather than one JSON blob; the shapes below are the contract that the JSON import (section 2) and any export must satisfy.

```json
{
  "version": 2,
  "updatedAt": "ISO-string",
  "workouts": {
    "<id>": {
      "id": "<id>",
      "person": "tom|quirijn",
      "type": "<training type key from section 6>",
      "date": "YYYY-MM-DD",
      "stats": {
        "done": true,
        "tijdMin": 45.5,
        "gemHr": 150,
        "maxHr": 178,
        "afstand": 10,
        "snelheid": 5.5,
        "hoogte": 120,
        "vermogen": 210,
        "rpe": 7
      }
    }
  },
  "weekly": { "<person>": { "<monday-ISO>": { "rek": 0, "zuipen": 0, "geneukt": 0 } } },
  "garmin": { "<person>": { "<monday-ISO>": { "vo2": 50, "rhr": 52, "gewicht": 78.5 } } }
}
```

Rules that must hold:

- **Week keys are always the ISO date of that week's Monday.** Weeks run Monday–Sunday throughout the app (calendar rows, weekly counters, Garmin check-ins, targets, panda scoring).
- **Training type keys are stable identifiers and must never be renamed**, because stored workouts reference them.
- `stats` fields are all optional and nullable. `done` is the checkbox "training gedaan"; everything else may be empty. `tijdMin` is **decimal minutes**. `afstand` is in km, except for swimming where it is in **metres**. `snelheid` is in the unit of its discipline (section 8). `hoogte` is elevation gain in metres and does not apply to swimming; `vermogen` is average watts and applies only to cycling. `rpe` is 1–10, default 5.
- **Normalisation on every load and import**: an older version stored the three weekly side-activity fields as booleans; they are now counters. `true` → `1`, anything non-numeric → `0`. Missing collections default to empty objects.

## 6. Training types & key dates — fixed configuration

**Two schedule phases.** Phase 1 (September–December 2026) is the build-up with 7 training types. Phase 2 (January–April 2027) is the harder schedule with 11 types. The palette shows only the types belonging to the phase of the month currently being viewed. Both sets remain valid forever — a session logged in phase 1 keeps its type when viewed later.

`goal` is the target value in race week. Run and swim goals are **paces in decimal minutes** (5.25 = 5:15); bike goals are **km/h**. Strength types have no goal and never show a target.

| key | label | sub-label | discipline | phase | fill | border | goal |
|---|---|---|---|---|---|---|---|
| `lange_run` | Lange run | 40–75 min | run | 1 | `#d5e8d4` | `#82b366` | 5.25 |
| `korte_run` | Korte run | interval / hoog tempo | run | 1 | `#d5e8d4` | `#82b366` | 4.667 |
| `lange_fiets` | Lange fiets | 90–120 min | fiets | 1 | `#ffe6cc` | `#d79b00` | 33 |
| `korte_fiets` | Korte fiets | ± 30 km | fiets | 1 | `#ffe6cc` | `#d79b00` | 35 |
| `zwem` | Zwemtraining | — | zwem | 1 | `#dae8fc` | `#6c8ebf` | 2.0 |
| `core` | Core / benen | stability | kracht | 1 | `#f8cecc` | `#b85450` | — |
| `upper` | Upper body | — | kracht | 1 | `#f8cecc` | `#b85450` | — |
| `long_run` | Long run | 75–100 min duur | run | 2 | `#ea9999` | `#b3423c` | 5.25 |
| `interval_run` | Interval run | hoog tempo | run | 2 | `#ea9999` | `#b3423c` | 4.667 |
| `easy_run` | Easy run | rustig / herstel | run | 2 | `#ea9999` | `#b3423c` | 5.75 |
| `bike60` | 60 min bike ride | — | fiets | 2 | `#ffe599` | `#bf9000` | 35 |
| `bike90` | 90–120 min bike | — | fiets | 2 | `#ffe599` | `#bf9000` | 33 |
| `bike150` | 150 min bike ride | — | fiets | 2 | `#ffe599` | `#bf9000` | 31 |
| `swim2000` | Swim 1 — 2000m | — | zwem | 2 | `#9fc5e8` | `#3d85c6` | 2.0 |
| `swim_int` | Swim 2 — interval | — | zwem | 2 | `#9fc5e8` | `#3d85c6` | 1.917 |
| `legs_core` | Legs + core | — | kracht | 2 | `#b6d7a8` | `#6aa84f` | — |
| `upper_body` | Upper body session | — | kracht | 2 | `#b6d7a8` | `#6aa84f` | — |
| `full_body` | Full body session | — | kracht | 2 | `#b6d7a8` | `#6aa84f` | — |

**Per-discipline reference goal** (used to scale baselines, section 8): run `5.25`, fiets `33`, zwem `2.0`.

**Direction of "better"**: run and swim are paces — **lower is better**. Bike is a speed — **higher is better**.

**Key dates** (all local time, no timezone handling needed):

| constant | value | meaning |
|---|---|---|
| race moment | 18 April 2027, 08:00 | countdown target; that calendar day is styled as race day |
| calendar range | September 2026 → April 2027 | exactly 8 months, navigation clamped to them |
| `TARGET_FROM` | 1 October 2026 | no targets shown before this date |
| `T0` | 5 October 2026 | first Monday of the target ramp |
| `T1` | 12 April 2027 | Monday of race week; targets reach their goal here |
| `PHASE2_FROM` | 1 January 2027 | palette switches to the phase-2 types |
| `PANDA_START` | 31 August 2026 | Monday of the first week that counts for the panda score |

**Race-goal reference text** for the collapsible explainer in the agenda sidebar (Dutch, shown verbatim to users):

> September is de warm-up maand: alles wat jullie invullen wordt de baseline. Vanaf oktober krijgt elke duurtraining een target dat wekelijks opschuift van jullie eigen baseline naar het racedoel in de week van 12 april. Vanaf januari schakelt het palet om naar het zwaardere schema; de targets van de nieuwe varianten bouwen door op jullie niveau van dat moment.
>
> **Racedoelen voor sub-5u (raceweek):**
> Long run → 5:15 /km · Interval run → 4:40 /km · Easy run → 5:45 /km
> 60 min bike → 35 km/u · 90–120 min → 33 km/u · 150 min → 31 km/u
> Swim 2000m → 2:00 /100m · Swim interval → 1:55 /100m
>
> Op de dag zelf: ±38 min zwemmen, ±2u40 fietsen, ±1u50 lopen plus wissels.

## 7. Features per view

### Agenda

**Training palette** (left column, sticky on desktop). Heading is `Trainingen — opbouw` in phase-1 months and `Trainingen — fase 2` in phase-2 months. One card per training type of the current phase, using that type's fill colour with a 5px left border in its border colour, label in bold and sub-label underneath. Cards are both draggable and tappable-to-select (see section 10). A selected card is visibly outlined. Below the palette: the hint text

> Sleep een training naar een dag, of klik hem aan en tik daarna op een dag. Klik op een geplande training om je tijden in te vullen. Slepen tussen dagen kan ook.

and the collapsible `🎯 Hoe werken de targets?` block from section 6.

**Month navigation** — `‹ maand jaar ›` centred above the calendar, month name in Dutch, previous/next disabled at the ends of the 8-month range. Opens on the current month if it falls inside the range, otherwise the first month. Changing month clears any selected palette type.

**Context banner**, depending on the month being viewed:
- September 2026 → `🔥 Warm-up maand.` Vul bij elke training je tijden in — dit wordt jullie baseline. Vanaf oktober rollen hier persoonlijke targets uit die elke week iets scherper worden richting sub-5u.
- Any month in 2027 → `💪 Fase 2 — het echte werk.` Het palet is opgeschroefd: langere ritten, interval in elke discipline. De targets bouwen gewoon door op jullie progressie sinds september.
- October–December 2026 → `🎯 Target-fase.` Elke duurtraining toont je doeltempo voor die week, opgebouwd vanaf je september-baseline richting racetempo (week van 12 april). Groen = gehaald.

Three visually distinct treatments: warm-up = amber, target = green, phase 2 = red.

**Comparison strip** — two cards, one per person (both always shown), scoped to the visible month: `<Naam> — 4/7 trainingen afgevinkt` plus a line of average speeds per discipline present that month (`Gemiddeld: 🏃 5:22/km · 🚴 31,4 km/u · 🏊 2:05/100m`), or `Nog geen tijden ingevuld deze maand`.

**Calendar** — a Monday-first month grid with columns `Ma Di Wo Do Vr Za Zo` plus a **`Week` column** on the right. Rows are whole weeks; days from adjacent months are shown faded. Today's cell is outlined in the accent colour. 18 April 2027 is rendered as a dark race-day cell containing `🏁 IRONMAN 70.3 VALENCIA`.

Each day cell lists that person's sessions for that date as small cards showing: a `✅` prefix when done, the type label, then a meta line with achieved time, achieved speed/pace, and `RPE n` where filled in, and finally the week's target as `🎯 5:18 /km` coloured green/amber/red by whether it was hit (section 8). Clicking a session opens the modal.

**Week column** — per calendar row: the ISO week number (`wk 42`) and three counter rows, one per side activity, each with a `−` button, the current number, and a `+` button:
- `🧘` → `rek`
- `🍺` → `zuipen`
- `🍆` → `geneukt`

Counters never go below zero, and a row with a count above zero is visibly highlighted (green). These are per person and per week.

**Adding and moving sessions** — dragging a palette type onto a day creates a session there; dragging an existing session between days moves it; tapping a palette type then tapping a day also creates one (the tap path is not optional — see section 10). Creating a session opens its modal immediately so the user can log it in one flow.

### Workout modal

Header: the type label plus `<Naam> · 14 oktober`, with the type's sub-label beneath. If a target applies to this session, a highlighted line `🎯 Target deze week: **5:18 /km**`.

Fields:
- `Training gedaan` — checkbox.
- `Behaalde tijd (mm:ss of h:mm:ss)` — free text; accepts `45:00`, `1:20:30` or a plain number of minutes.
- `Gem. hartslag` and `Max. hartslag` — numbers, side by side.
- For non-strength types: `Afstand (km)` — or `Afstand (meter)` for swimming — and the speed field, labelled `Snelheid (km/u)` for bike, `Tempo (min/100m, bv. 2:10)` for swim, `Tempo (min/km, bv. 5:30)` for run. The speed field is optional: leaving it empty is normal, and beneath it a live hint reads `berekend: 5:18 /km`, recomputed as the user types time and distance.
- For non-swim types: `Hoogtemeters (m)`. For bike only: `Gem. vermogen (W)`. Both placeholder `Garmin`.
- `Hoe zwaar? n/10` — a 1–10 slider showing its current value live.

Actions: `Sluit`, a delete button (`🗑`, with a confirmation), and `Opslaan`.

### Dashboard

All cards are scoped to the currently selected person.

**Finish-time card** (full width, dark navy gradient, white text). Heading `Geschatte eindtijd — <Naam>` with `betrouwbaarheid: hoog|gemiddeld|laag` on the right. A very large `4:52` with `± 12 min · op basis van 37 afgeronde trainingen` beside it. Four split boxes: `🏊 1.9 km`, `🚴 90 km`, `🏃 21.1 km`, `🔁 Wissels`, each with its estimated time. Then a goal line: `Doel 5:00 →` followed by either `je zit er 0:08 onder. Vasthouden.` (green) or `nog 0:14 te winnen.` (red), plus, when behind, `Grootste winst zit in het <lopen|fietsen|zwemmen>.` naming the discipline furthest from its goal in relative terms.

When any discipline lacks data, the card instead shows `–:––` with `nog niet te berekenen` and: `Ik heb afgeronde trainingen met tijd + afstand nodig van elke discipline. Ontbreekt nog: **🏊 zwemmen, 🏃 lopen** (laatste 6 weken).`

**Three discipline cards** — `🏃 Lopen`, `🚴 Fietsen`, `🏊 Zwemmen`. Each shows:
- `Laatste 4 weken` — average speed over the last 28 days plus a trend marker versus the 28 days before that (`▲ 2,4% beter` green / `▼ 1,8% minder` red / `≈ gelijk` grey).
- `Racedoel` — the discipline reference goal.
- `Efficiëntie (snelheid/hartslag)` — with the same trend treatment.
- `Sessies gelogd` — count of sessions with a usable speed.
- A sparkline of the last 10 sessions, oriented so **up always means faster** (for paces, plot the negated value), captioned `verloop laatste N sessies (omhoog = sneller)`.

Empty state: `Nog geen afgeronde <lopen>-trainingen met tijd en afstand.`

**Volume & discipline card** — `Uren afgelopen week`, `Consistentie (afgevinkt van gepland)` as a percentage, `Trainingsload-trend` as a trend marker, and a bar chart of training hours per week over the last 12 weeks, captioned `trainingsuren per week (laatste N weken)`.

**Garmin check-in card** (`⌚ Garmin check-in (wekelijks)`) — three number inputs for the **current week**: `VO2max`, `Rust-HR`, `Gewicht` (kg, one decimal), saving on change. Once at least two VO2max values exist, a sparkline of the history beneath it, captioned `VO2max-verloop`; otherwise the hint `Vul dit wekelijks in vanaf je Garmin — VO2max en rust-HR zijn de beste onafhankelijke check op mijn schatting.`

**Side-activities card** — `🧾 Neven-activiteiten (laatste N wkn)` with the 12-week sums: `🧘 Rekmomenten`, `🍺 Avondjes zuipen`, `🍆 Geneukt`, and `🐼 Panda counter` (signed).

**Written analysis card** (full width, `🧠 Mijn analyse`) — generated Dutch prose, assembled from these rules, in this order:
- No completed sessions at all → only: `Nog geen afgeronde trainingen. Zodra je trainingen afvinkt met tijd en afstand begint hier de analyse: vorm per discipline, trends, en een steeds nauwkeurigere eindtijdvoorspelling.`
- Otherwise: `<Naam> heeft **N trainingen** afgerond.`
- Consistency: ≥85% → `Consistentie is X% — sterk, dit is de belangrijkste voorspeller van je eindtijd.`; ≥65% → `Consistentie is X% — kan strakker; elke gemiste sessie kost meer dan een langzame sessie.`; below → `Consistentie is X% — hier zit je grootste probleem, niet in je tempo.`
- With a full estimate: `Op huidige vorm kom je uit rond **4:52**.` followed by, if under 5 hours, `Dat is onder de 5 uur — de opdracht is nu vasthouden en niet blesseren.`, otherwise `Voor sub-5 moet er nog 0:14 af; de weektargets in de agenda zijn daarop berekend.` Without one: `Voor een eindtijdschatting mis ik nog recente afgeronde trainingen in minstens één discipline.`
- Volume: last week between 0 and 4 hours → `Weekvolume (3,2u) is aan de lage kant voor een 70.3 — bouw richting 7–9u per week.`; 9 hours or more → `Let op: 9,4u in één week is fors. Herstel is ook training.`

## 8. Business logic to preserve exactly

These are the failure-prone parts. Implement them precisely; they are deliberate choices, tuned by the users, not defaults to be improved on.

### 8.1 Units, parsing and formatting

- **Run** speed is **pace in decimal minutes per km** (5.5 = 5:30). **Swim** speed is **pace in decimal minutes per 100 m**. **Bike** speed is **km/h**. Strength has no speed.
- **Derived speed**: if a session has an explicit `snelheid`, use it. Otherwise, if it has both time and distance: run → `tijdMin / afstand`; bike → `afstand / (tijdMin / 60)`; swim → `tijdMin / (afstand / 100)`. Otherwise the session has no usable speed and is excluded from every average, trend and estimate.
- **Time input** accepts `mm:ss`, `h:mm:ss`, or a bare number of minutes, and is stored as decimal minutes.
- **Speed input** accepts `m:ss` for paces and a decimal (comma or point) for km/h.
- **Display**: paces as `m:ss` with `/km` or `/100m`; bike speeds as one decimal with a **comma** as decimal separator and `km/u`. Durations as `m:ss` or `h:mm:ss`.
- **The hours:minutes format used for the finish estimate and its splits must round the total number of minutes FIRST, then split into hours and minutes.** Rounding after splitting produced `5:60` for 359.7 minutes. This is a regression that has already happened once — include a test for it.
- All numeric readouts use tabular figures so columns don't jitter.

### 8.2 Weekly targets

Only types with a goal get targets, and only for dates on or after `TARGET_FROM` (1 Oct 2026).

1. **Baseline** for a person and a training type:
   - The average derived speed of that person's September 2026 sessions **of that exact type**, if any exist.
   - Otherwise (this is the normal case for every phase-2 type, which has no September history): the average of that person's September sessions **in the same discipline**, scaled by `type.goal / disciplineReferenceGoal`.
   - If there is no September data in the discipline at all, there is no baseline and no target is shown.
2. **Progress fraction** `f` = position of the session's **Monday** between `T0` (5 Oct 2026) and `T1` (12 Apr 2027), clamped to 0…1.
3. **Target**:
   - If the baseline is already at or better than the goal: keep improving by 4% across the full period — for paces `baseline × (1 − 0.04f)`, for bike speed `baseline × (1 + 0.04f)`.
   - Otherwise linear interpolation: `baseline + (goal − baseline) × f`.
4. **Colouring** of an achieved speed against its target: **hit** when at least as good as the target; **close** when within 5% the wrong side of it; **miss** beyond that. (For paces "at least as good" means lower; for bike speed, higher.)

### 8.3 Finish-time estimate

Uses **completed sessions only** (`done` true, with a usable speed).

**Recent form per discipline** = a weighted average over the **last 42 days**, where sessions are weighted by their position in that window (oldest = 1, next = 2, …) so recent sessions count more. Also record the number of sessions used, `n`.

**Splits**, in minutes:
- Swim: `pace × 0.97 × 19` — 1900 m, with a 3% wetsuit advantage.
- Bike: `90 / (speed × 1.03) × 60` — 90 km, with a 3% race-day effect.
- Run: `pace × 1.05 × 21.1` — 21.1 km, 5% slower than training pace because of the bike leg.
- Transitions: a flat **8 minutes**.

**Total** is only computed when all three disciplines have recent data; otherwise the card names which are missing. **Margin** is ±4% of the total, rounded to whole minutes. **Confidence** comes from the smallest `n` across the three disciplines: ≥6 → `hoog`, ≥3 → `gemiddeld`, else `laag`.

The `Doel 5:00` comparison uses **300 minutes**. The "biggest gain" advice compares each discipline's recent form to its reference goal in relative terms (`(recent − goal) / goal` for paces, `(goal − recent) / goal` for bike speed) and names the largest positive gap.

### 8.4 Trends and efficiency

- **Trend** compares the last 28 days against the 28 days before that, using plain (unweighted) averages. A relative difference under **0.5%** reads as `≈ gelijk`; otherwise `▲ X% beter` or `▼ X% minder` with one decimal, comma separator, where "better" respects the direction of the discipline.
- **Efficiency** = speed per heartbeat: convert each session's speed to km/h (bike: as-is; run: `60 / pace`; swim: `6 / pace`), divide by average heart rate, average those, multiply by 100. Only sessions with a recorded average heart rate count. Higher is always better.
- **Consistency** = completed ÷ planned, over all of that person's sessions dated from 1 September 2026 up to (not including) today.
- **Training load** per week = `Σ (tijdMin × rpe)`, with RPE defaulting to 5 when missing; the card shows only its trend, last week vs. the week before.
- **Weekly volume** = `Σ tijdMin / 60` of completed sessions in that week.
- The dashboard's rolling window for weekly charts and side-activity sums is the **last 12 completed-or-current weeks** counted from `PANDA_START`.

### 8.5 Panda counter

Starting at the week of `PANDA_START` (Monday 31 August 2026), for every week that has **fully elapsed** (its Sunday is in the past) and is not after the race:

- `geneukt > 0` that week → **+1**
- otherwise → **−1**

The sum is the person's panda score, always displayed with an explicit sign. The three weekly counters themselves are just detail; only `geneukt` feeds the score.

### 8.6 Week numbering

Week numbers shown in the calendar are ISO week numbers (Monday-based, the week containing the year's first Thursday is week 1).

## 9. Visual identity / design tokens

Recreate this design system through whatever theming mechanism the template uses (CSS variables, Tailwind config, theme object) — the values and their roles matter, the mechanism does not.

**Palette**
- Background `#f4f6f8`, card surface `#fff`, ink `#1c2733`, muted text `#6b7a8a`
- Accent (today's date outline, highlights) `#e2504c`
- Semantic: good `#2e9e5b`, warning `#e08a00`, bad `#d33`
- Header and the finish-time hero share a 135° navy gradient `#16222f → #233a52`; on navy, secondary text is `#aec3d8`, "under goal" green is `#7fe0a7`, "over goal" red is `#ffb0a8`
- Race-day calendar cell: the same navy gradient, white text
- Week-extras column sits on `#eef1f4`; an active counter row is `#dff3e6` with a green border

**Training-type colours** carry meaning: phase 1 is pastel, phase 2 is saturated, and within each phase the discipline determines hue — run red, bike yellow/orange, swim blue, strength green. Exact values are in the section 6 table; each session card and palette item uses its fill as background and its border colour as a 4–5px left border.

**Shape and type**
- Radii: 8px on small controls and session cards, 10px on day cells and palette items, 14px on dashboard cards and the modal
- Body text in a system sans stack; headings inside cards are small, uppercase, letter-spaced and muted; the finish time is the one genuinely large number on the screen (~2.4rem, weight 800)
- All times and measurements in tabular figures
- Cards carry a soft shadow rather than a border; the dashed hairline between dashboard stat rows is `#e3e8ee`
- Sparklines and bar charts are compact — full card width, ~40px tall, single-colour, no axes, no gridlines, no legend; a chart's meaning comes from its caption

**Status colours** for target hit/close/miss map to good/warning/bad. Trend markers use good/bad/muted. Red is reserved for genuinely negative states — it is never used for the panda counter or the side activities, which are neutral.

## 10. Responsiveness, mobile agenda & accessibility

The previous version was desktop-only; this one is used on a phone at the side of the pool, so:

- **Tap-to-add is a primary interaction, never a fallback.** On any viewport: tap a palette type to select it, tap a day to place it. Drag-and-drop is an enhancement layered on top for pointer devices. The app must be fully usable with no drag gesture at all — including *moving* a session, which needs a date field or a "verplaats" action in the modal.
- On narrow viewports the palette becomes a horizontally scrollable chip row above the calendar rather than a sidebar.
- On narrow viewports the calendar drops the 8-column month grid, which is unreadable at that width. Show the current week (or an agenda-style day list) with the same session cards, week counters and targets, and keep the month view available on wider screens.
- The workout modal becomes a full-height sheet on phones, with inputs large enough to hit and the correct on-screen keyboards (numeric where appropriate).
- Dashboard cards stack to one column; the finish-time card keeps its splits readable by wrapping them.
- Background refreshes must never steal focus or overwrite a field the user is currently editing — guard re-renders against in-progress input.
- Inputs, selects and buttons need visible focus states; the ± counter buttons and the palette items need real hit targets (≥32px) and accessible labels, since their visible content is a bare emoji or symbol.
- The countdown ticks every second: don't let it force a re-render of the whole page.

## 11. Explicitly out of scope for v1

- Per-user accounts, login, or roles — one shared password (or none) is fine.
- Automatic Garmin/Strava import. The weekly check-in is typed in by hand on purpose.
- Editing the training-type catalogue, goals or key dates from the UI — these are fixed configuration (section 6).
- Real-time collaboration beyond "last write wins".
- Notifications, reminders, undo history, or edit history.
- Support for other athletes, other races, or other distances.

## 12. Instructions to the coding assistant

1. Build the views, features and business logic in sections 4–8 using whatever the chosen template's idiomatic approach is for routing, state, persistence and styling. Do **not** replicate the previous implementation's technology: it was one 53KB HTML file with no framework, no build step, hand-rolled inline SVG charts and `localStorage`-only persistence. Satisfy the *behavioural* requirements in section 2 with the template's own data layer — a real table structure is preferable to one JSON blob if the template offers a database, and the template's chart library is preferable to hand-written SVG.
2. Treat section 6 as fixed configuration in code (a single module), not as user data, and section 8 as the specification for a small, separately testable calculation layer — pure functions over the data model in section 5, with no UI in them.
3. Write tests for section 8 at minimum: the hours:minutes rounding case (359.7 minutes → `6:00`, never `5:60`), baseline scaling for a phase-2 type with no history of its own, target interpolation at `T0`/mid/`T1`, the already-better-than-goal 4% rule, hit/close/miss classification in both directions, the weighted 42-day recency average, and the panda counter across a part-elapsed week.
4. Apply the design system in section 9 through the template's native theming.
5. Meet the mobile and accessibility expectations in section 10 — particularly the no-drag path, which is the one genuinely new requirement compared to the previous version.
6. Keep every piece of user-facing copy Dutch and informal, including empty states and error messages you have to invent, and keep the panda counter and side activities exactly as specified in section 2.
