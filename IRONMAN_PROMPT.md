# Build prompt: Ironman 70.3 Valencia Tracker

Use this document as the build spec when applying it to a chosen web app template/starter. It describes **what** the app must do and **how it must behave**, not which framework, database, or hosting stack to use — pick whatever the template already provides and implement the requirements below on top of it.

There is no companion seed-data file: this app starts empty. Everything it needs to be configured with — the training-type catalogue, the key dates, the race targets — is listed inline in section 6 and must be built in as fixed configuration.

---

## 1. Project pitch

Tom and Quirijn are training for the **Ironman 70.3 Valencia on Sunday 18 April 2027**, goal: **finish under 5 hours**. This is their shared training tracker — from October onward it acts as their coach. It does three things:

1. **Agenda** — a drag-and-drop training calendar running September 2026 through April 2027. They plan sessions from a palette of training types; the tracker turns each planned session into a **prescription** (distance or duration, pace or heart-rate zone, and the interval structure), computed from their current fitness and building toward what sub-5 requires, with a 3:1 build/rest rhythm. Afterwards it judges whether the prescription was met.
2. **Garmin sync** — via intervals.icu, completed activities (with laps/intervals, heart rate, wind) and wellness data (VO2max, resting HR, weight) flow in automatically, so nothing has to be typed in by hand. Manual entry remains for whoever is not connected.
3. **Dashboard** — an honest **race-time prediction** (as if racing today, and projected to 18 April), built per leg from fitness markers that actually mean something, plus volume, consistency, the Garmin data and a written summary in Dutch.

It is a private tool for exactly two people. It is not a general-purpose training app, has no social features, and does not need to support other races or other users.

## 2. Non-negotiable constraints

- **All UI text and content must be Dutch**, in an informal tone (`je`/`jullie`, not `u`). Every label, button, placeholder, empty state and generated sentence is Nederlandstalig. Only this build prompt is in English.
- **The tone and the in-jokes are deliberate.** The app tracks, per week, three side activities with emoji: 🧘 `rek` (stretching sessions), 🍺 `zuipen` (nights out drinking), 🍆 `geneukt` (sex). A "🐼 panda counter" per person is derived from the last one. **Do not sanitise, rename, soften, hide, or "professionalise" any of this** — it is the point of the app for its two users. Keep the emoji and the labels exactly as specified.
- **Data must persist server-side and be shared** between both users. Tom logging a session on his laptop must show up on Quirijn's, and each of them can see and edit the other's data. Local-only browser storage is explicitly not sufficient.
- **No real-time requirement.** Refresh-on-navigation, or polling every 30–60s while the tab is visible, is enough. No websockets or live sync.
- **"Last write wins" is acceptable** conflict resolution. No merge logic, no per-field conflict UI.
- **One shared password is sufficient authentication** for the whole app. Per-user accounts, roles, or SSO are explicitly **not** required — both users are effectively the same account, and the person switcher (section 3) is a *view* control, not a permission boundary.
- **Never lose an edit silently.** The header carries a save-state indicator with the states `·` (idle), `⏳ opslaan…`, `✓ opgeslagen`, `✓ geladen`, `⚠️ fout bij opslaan`. If a save fails, the UI must say so and the user's input must remain visible and recoverable in their own browser.

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
- Person tabs, view tabs, the `🔄 Garmin` button (when anyone is connected) and the save-state indicator.

**Context banner** — a single strip below the header, shown only in the Agenda view, whose content depends on the month being viewed (see section 7).

**Agenda view** — two columns on desktop: a sticky training palette on the left (~215px) and the month calendar filling the rest. Below the palette sits a collapsible explainer `🎯 Hoe werken de voorschriften?` (text in section 6).

**Dashboard view** — a responsive card grid (cards ~300px minimum, auto-fitting), with the finish-time card spanning the full width at the top and the written analysis spanning the full width at the bottom.

**Workout modal** — a centred overlay dialog for editing one session; closes on backdrop click.

## 5. Data model

Five collections. If the template offers a real database, model these as tables (`workouts`, `weekly`, `garmin`, `person_settings`, `week_flags`) rather than one JSON blob; the shapes below are the contract every read and write goes through. **Schema changes are additive only** — never drop or convert a column holding the users' data.

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
        "done": true, "tijdMin": 45.5, "gemHr": 150, "maxHr": 178, "afstand": 10,
        "snelheid": 5.5, "hoogte": 120, "vermogen": 210, "rpe": 7
      },
      "kind": "long|easy|threshold|interval|endurance|tempo|continuous|sets|strength|null",
      "structure": [
        { "reps": 6, "workDistM": 800, "workDurS": null, "speed": 4.0, "watts": null,
          "restDurS": 90, "restDistM": null, "actual": [4.01, 3.98, null], "actualHr": [168, 170, null] }
      ],
      "wind": { "source": "manual|auto", "bft": 4, "dir": "tegen|mee|zij|wisselend",
                "speedKmh": 25, "fromDeg": 250, "headKm": 24, "tailKm": 21, "crossKm": 15 },
      "indoor": false,
      "source": "manual|icu",
      "externalId": "<intervals.icu activity id or null>"
    }
  },
  "weekly":   { "<person>": { "<monday-ISO>": { "rek": 0, "zuipen": 0, "geneukt": 0 } } },
  "garmin":   { "<person>": { "<monday-ISO>": { "vo2": 50, "rhr": 52, "gewicht": 78.5 } } },
  "settings": { "<person>": { "z2Low": 132, "z2High": 148, "maxHr": 192, "lthr": 172, "ftp": 240,
                              "z2Source": "garmin|manual|null", "ftpSource": "garmin|manual|null",
                              "lastSync": "ISO-string|null" } },
  "weekFlags": { "<monday-ISO>": "build|rest|taper|race" },
  "integrations": { "tom": true, "quirijn": false }
}
```

Rules that must hold:

- **Week keys are always the ISO date of that week's Monday.** Weeks run Monday–Sunday throughout the app (calendar rows, weekly counters, Garmin wellness, week rhythm, panda scoring).
- **Training type keys are stable identifiers and must never be renamed**, because stored workouts reference them.
- `stats` fields are all optional and nullable. `done` is the checkbox "training gedaan". `tijdMin` is **decimal minutes**. `afstand` is in km, except for swimming where it is in **metres**. `snelheid` is in the unit of its discipline (section 8). `hoogte` is elevation gain in metres (not for swimming); `vermogen` is average watts (cycling only, and only from a real power meter). `rpe` is 1–10.
- `kind` may be null: a session without its own kind falls back to the default for its type (section 6). Every session from before October therefore reads correctly without migration.
- `structure[].speed` and `actual[]` are in the discipline's unit (run min/km, swim min/100m, bike km/h). `actual` holds one value per repetition; `null` is a missed rep.
- `externalId` is unique: it is how a second Garmin sync updates a session instead of duplicating it.
- `weekFlags` holds **only** weeks that differ from the default rhythm (section 8.4). It is shared — both users train the same schedule.
- `integrations` is computed by the server (does this person have an intervals.icu key configured) and never exposes the key.
- **Missing collections default to empty objects** on load, so nothing downstream has to null-check them.

## 6. Training types & key dates — fixed configuration

**Two schedule phases.** Phase 1 (September–December 2026) is the build-up with 7 training types. Phase 2 (January–April 2027) is the harder schedule with 11 types. The palette shows only the types belonging to the phase of the month currently being viewed. Both sets remain valid forever — a session logged in phase 1 keeps its type when viewed later.

The `goal` column is legacy (see the 5:00 split below). Paces are decimal minutes (5.25 = 5:15); bike values km/h.

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

**Session kinds.** Each discipline has kinds; a session's kind decides how it is read and prescribed. Default kind per type key (used whenever `kind` is null):

| discipline | kinds (Dutch label) | default per type |
|---|---|---|
| run | `long` Long run (zone 2) · `easy` Easy run · `threshold` Threshold · `interval` Interval | `lange_run`/`long_run` → long, `korte_run`/`interval_run` → interval, `easy_run` → easy |
| fiets | `endurance` Duurrit · `tempo` Tempo / sweet spot · `interval` Interval | `lange_fiets`/`bike90`/`bike150` → endurance, `korte_fiets`/`bike60` → tempo |
| zwem | `continuous` Doorzwemmen · `sets` Sets | `zwem`/`swim_int` → sets, `swim2000` → continuous |
| kracht | `strength` | all strength types |

**Direction of "better"**: run and swim are paces — **lower is better**. Bike is a speed — **higher is better**.

**How 5:00 splits over the legs** (`GOAL_SPLITS`, minutes): swim **37** (1:57 /100m), bike **153** (35.3 km/h), run **102** (4:50 /km), transitions **8** — exactly 300. The `goal` column above is legacy and no longer drives anything: those race-week goals summed to ±5:21, not sub-5. Derived requirements used by prescriptions and the dashboard: run threshold = 4:50 × 0.88 ≈ **4:15 /km**; swim CSS = 1:57 / (1.03 × 0.95) − 4 s ≈ **1:55 /100m**.

**Key dates** (all local time, no timezone handling needed):

| constant | value | meaning |
|---|---|---|
| race moment | 18 April 2027, 08:00 | countdown target; that calendar day is styled as race day |
| calendar range | September 2026 → April 2027 | exactly 8 months, navigation clamped to them |
| `BLOCK_START` | 5 October 2026 | Monday of build week 1; the 3:1 rhythm counts from here |
| `TAPER_WEEK` | 5 April 2027 | taper week |
| `RACE_WEEK` | 12 April 2027 | race week |
| `PHASE2_FROM` | 1 January 2027 | palette switches to the phase-2 types |
| `PANDA_START` | 31 August 2026 | Monday of the first week that counts for the panda score |

**Explainer text** for the collapsible `🎯 Hoe werken de voorschriften?` in the agenda sidebar (Dutch, shown verbatim):

> Elke geplande training krijgt een voorschrift: afstand of duur, tempo of hartslag, en bij kwaliteitstrainingen de opbouw (bv. 6 × 800 m). Dat rekent de tracker uit jullie eigen trainingen van de laatste weken — drempeltempo, zone-2-tempo, duursnelheid op de fiets en zwem-CSS — en schuift het elke opbouwweek een stap op richting wat sub-5 vraagt.
>
> Long runs zijn altijd zone 2: daar is de hartslag het doel en het tempo alleen een verwachting. Elke vierde week is een rustweek (±35% minder); klik in de weekkolom om een week om te zetten.
>
> **Sub-5 op de dag zelf:** zwemmen 0:37 (1:57 /100m) · fietsen 2:33 (35,3 km/u) · lopen 1:42 (4:50 /km) · wissels 0:08

## 7. Features per view

### Agenda

**Training palette** (left column, sticky). Heading is `Trainingen — opbouw` in phase-1 months and `Trainingen — fase 2` in phase-2 months. One card per training type of the current phase, using that type's fill colour with a 5px left border in its border colour, label in bold and sub-label underneath. Cards are both draggable and click-to-select (section 10). A selected card is visibly outlined. Below the palette the hint text

> Sleep een training naar een dag, of klik hem aan en tik daarna op een dag. Klik op een geplande training om je tijden in te vullen. Slepen tussen dagen kan ook.

and the collapsible `🎯 Hoe werken de voorschriften?` block from section 6.

**Month navigation** — `‹ maand jaar ›` centred above the calendar, month name in Dutch, previous/next disabled at the ends of the 8-month range. Opens on the current month if it falls inside the range, otherwise the first month. Changing month clears any selected palette type.

**Context banner**, depending on the month being viewed:
- September 2026 → `🔥 Warm-up maand.` Vul bij elke training je tijden in — hieruit leest de tracker jullie startfitheid. Vanaf oktober krijgt elke training een voorschrift.
- October–December 2026 → `🎯 Opbouw.` Elke training krijgt een voorschrift: hoe ver, hoe hard of in welke hartslag, en de opbouw — uit jullie huidige fitheid, richting wat sub-5 vraagt. Long runs altijd in zone 2. Elke vierde week is een rustweek. Na afloop: groene stip = gehaald.
- Any month in 2027 → `💪 Fase 2 — het echte werk.` Het palet is opgeschroefd: langere ritten, interval in elke discipline. De voorschriften bouwen door op jullie fitheid van dat moment; vanaf 5 april begint de taper.

Three visually distinct treatments: warm-up = amber, build = green, phase 2 = red.

**Comparison strip** — two cards, one per person (both always shown), scoped to the visible month: `<Naam> — 4/7 trainingen afgevinkt` plus average speeds per discipline present that month, or `Nog geen tijden ingevuld deze maand`.

**Calendar** — a Monday-first month grid with columns `Ma Di Wo Do Vr Za Zo` plus a **`Week` column**. Rows are whole weeks; days from adjacent months are faded. Today's cell is outlined in the accent colour. 18 April 2027 is a dark race-day cell containing `🏁 IRONMAN 70.3 VALENCIA`.

Each day cell lists that person's sessions as small cards:
- **Not done yet**: the type label, the kind if it differs from the type's default, and the prescription summary, e.g. `🎯 14,5 km · ♥ ≤ 148`, `🎯 6×800 m @ 4:05 /km`, `🎯 2×12 min · ♥ 156–164`, `🎯 8×200 m @ 1:58 /100m`.
- **Done**: `✅` + label, `⌚` if it came from Garmin, a coloured dot for the verdict (green hit / amber close / red miss, section 8.5), then time · speed · `♥ avgHR`, the structure summary (`6×800 m · gem. 3:58 /km`) and for rides the wind (`💨 4 Bft · 24 km tegen`). A ride on the home trainer shows `🏠` after the label and its watts (`185 W`) instead of speed and wind.
- **Strength**: only `✅` + label. Strength sessions are not recorded by the watch.
Clicking a session opens the modal.

**Week column** — per calendar row: the ISO week number (`wk 42`), a **week-kind button** (`opbouw` / `rustweek` / `taper` / `raceweek`, each its own colour; clicking cycles build → rest → taper, and returning to the default removes the override; a ✎ marks an override; not shown for September), and three counter rows, one per side activity, each with `−`, the number, `+`:
- `🧘` → `rek`
- `🍺` → `zuipen`
- `🍆` → `geneukt`

Counters never go below zero; a row with a count above zero is highlighted green. Per person, per week.

**Adding and moving sessions** — dragging a palette type onto a day creates a session there; dragging an existing session between days moves it; clicking a palette type then a day also creates one. Creating a session opens its modal immediately.

### Workout modal

Header: type label plus `<Naam> · 14 oktober` (and `· ⌚ uit Garmin` when synced), sub-label beneath.

**Prescription panel** (non-strength): `🎯 <summary>` with the week kind on the right, the detail lines (warm-up, main set with rest, cool-down; for long runs the zone-2 range and the expected pace explicitly labelled as an expectation, not a goal), a warning line when something is missing (e.g. no zone 2 set, no threshold measurement yet), `Gebaseerd op: …` naming the sessions it rests on, and — once done — the verdict line (`✓ Gehaald` / `≈ Bijna` / `✗ Niet gehaald` with the notes). A button `📋 Voorschrift als opbouw overnemen` copies the prescribed blocks into the structure editor. The prescription follows the kind currently selected in the modal.

Fields:
- `Training gedaan` — checkbox.
- **Strength types: nothing else** (date field and the buttons only). Values stored on older strength sessions stay in the database untouched.
- `Soort training` — a radio group of the discipline's kinds.
- `Opbouw` — block editor, shown for threshold/interval/tempo/sets or when blocks exist: per block `reps × work @ target, rust` (work is a distance like `800 m` or a duration like `20 min`; target is a pace, or for cycling km/h or watts like `210 W`), plus a free field for the realised value per rep (`4:01, 3:58, -`). `+ blok` adds a row, `✕` removes one.
- `Behaalde tijd (mm:ss of h:mm:ss)`, `Gem. hartslag`, `Max. hartslag`, distance and speed/pace with the live `berekend: …` hint, `Hoogtemeters` (not swim), `Gem. vermogen (W)` (bike).
- Bike only: `🏠 Binnen (hometrainer)` checkbox with the hint `geen wind; snelheid telt niet mee, vermogen wel`; set automatically for trainer rides from Garmin and overridable. When ticked the wind fields are hidden and wind is saved empty.
- Bike only, outdoors: wind — automatic summary when it came from Garmin (`💨 4 Bft · 24 km tegen · 21 km mee`), otherwise manual `Wind (Bft)`, `Vooral` (tegen / mee / zij / wisselend) and `Km tegenwind`.
- `Hoe zwaar? n/10` slider.
- `Verplaatsen naar` — date field (the no-drag way to move a session).

Actions: `Sluit`, delete (`🗑` → `Zeker weten?`), `Opslaan`.

### Dashboard

All cards are scoped to the selected person.

**Finish-time card** (full width, navy). Heading `Geschatte eindtijd — <Naam>`. Two large numbers side by side: `Als je vandaag racet` and `Projectie 18 april`, each `h:mm ± n min`. Next to them: `Onder de 5 uur. Vasthouden en niet blesseren.` or `Nog 0:14 te winnen. Grootste tekort: <onderdeel>.` The projection carries the subline `als je het schema volgt — langere ritten, bricks — even trouw als de laatste 4 weken (n%)`. Below, one box per leg (`🏊 1,9 km`, `🚴 90 km`, `🏃 21,1 km`): today's time and race pace, confidence, `18 apr <time> · 5:00 vraagt <split>` with the difference in minutes, `Raceklaar n%` (green ≥ 75%) with its explanation, and the method plus what it rests on. A leg without data shows `–:––` and what to do to get one. A fourth box shows the 8-minute transitions as a fixed assumption.

**Goal card** `🎯 Wat 5:00 vraagt` (full width, directly below the finish-time card): a table per leg — `Nu` · `5:00 vraagt` · `Sneller nodig` · `Per week tot 5 april` · `Oordeel` (`✓ al op 5:00-niveau` / green `realistisch` / amber `ambitieus` / red `onwaarschijnlijk` / what is missing). The bike row compares FTP with the required FTP when FTP and weight are known, otherwise `🚴 Duursnelheid`. Below it: `Als je het schema volgt: realistisch doel h:mm, ambitieus h:mm.` and which leg 5:00 asks the most of, plus a collapsible explanation of the growth rates (section 8.7).

**Three discipline cards** showing fitness markers instead of session averages:
- `🏃 Lopen` — `Drempeltempo` (with confidence, basis, and `sub-5: 4:15 /km`), `Tempo in zone 2`, `Long run (mediaan laatste 3)`, `Zone 2` range; sparkline of the threshold marker per week over the last 10 weeks (up = faster).
- `🚴 Fietsen` — `Duursnelheid (windgecorrigeerd)` (with `race 35,3 km/u`), `FTP`; sparkline per week.
- `🏊 Zwemmen` — `CSS` (with `sub-5: 1:55 /100m`); sparkline per week.
Each card explains in one line where its marker comes from when there is no history yet.

**Volume & discipline card** — `Uren afgelopen week`, `Consistentie (afgevinkt van gepland)`, `Trainingsload-trend`, weekly-hours bars over the last 12 weeks, captioned `… zonder kracht`.

**Garmin card** — `⌚ Garmin (automatisch)` for a connected person (`via intervals.icu · laatst opgehaald …`, values still overridable), otherwise `⌚ Garmin check-in (wekelijks)`. Inputs for the current week: `VO2max`, `Rust-HR`, `Gewicht`; VO2max sparkline once two values exist. Below: `Max-HR en zone 2` with `Max-HR`, `Van`/`Tot` bpm and `FTP (W)`, labelled `zone 2 uit je Garmin-zones` / `zone 2 zelf ingevuld` / `zone 2 = 60–70% van max: …` / `nog niet ingesteld`. Editing zone 2 by hand marks it manual; the sync then leaves it alone. The same holds for FTP: typed in wins, emptied hands it back to the estimate from Garmin.

**Side-activities card** — `🧾 Neven-activiteiten (laatste N wkn)` with 12-week sums of 🧘/🍺/🍆 and `🐼 Panda counter` (signed).

**Written analysis card** (full width, `🧠 Mijn analyse`), Dutch prose in this order:
- No completed sessions → only: `Nog geen afgeronde trainingen. Zodra je trainingen afvinkt — of je Garmin ze binnenhaalt — begint hier de analyse.`
- `<Naam> heeft **N training(en)** afgerond.` (singular for one)
- Consistency: ≥85% / ≥65% / below — same three sentences as before.
- Complete estimate: `Als je vandaag zou racen: **h:mm** (± n min). Met de huidige trend kom je op 18 april rond **h:mm**.` then either `Dat is onder de 5 uur — vasthouden en niet blesseren.` or `Voor sub-5 moet er nog h:mm af; het grootste tekort zit in het <onderdeel> (n min boven de 5:00-verdeling).` Incomplete: `Voor een eindtijd mis ik nog: <onderdeel> (<wat te doen>); …`
- Volume <4 h or ≥9 h: the same two warnings as before.

**Header** additionally shows, when anyone is connected, a `🔄 Garmin` button and the last sync message (`⌚ 3 nieuwe trainingen`, `⌚ bijgewerkt`, or `⚠️ Garmin: …`).

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

### 8.2 Sessions, kinds and structure

- **Kind**: `kindOf(w)` = `w.kind` if set, else the default for its type (section 6).
- **Strength** sessions are check-only and **excluded from weekly volume and training load** — including older ones that still carry time/RPE.
- **Block editor parsing**: a work value containing `min`, `:` or ending in `s` is a duration, otherwise a distance; a bare number under 50 is km, otherwise metres (`800` → 800 m, `2` → 2 km). Durations: `20` and `20 min` → 20 min, `1:30` → 90 s, `90 s` → 90 s. Rest may be prefixed with text (`rust 1:30`). Cycling targets ending in `W` are watts. Rows without reps or work are dropped. Converting blocks → rows → blocks must be lossless.
- **Structure summary** on cards: `6×800 m · gem. 3:58 /km` when realised values exist (missed reps ignored), otherwise `2×20 min @ 4:24 /km`.

### 8.3 Fitness markers

Computed per person **from completed sessions strictly before a reference date**. Prescriptions use the session's own date, so past prescriptions stay fixed while future ones move with fitness. Each marker carries its value, the number of sessions, the latest date, the sessions it rests on (for display) and a confidence: `hoog` (≥3 sessions, newest ≤21 days), `gemiddeld` (≥2, ≤35 days), else `laag`.

- **Zone 2**: from settings; if absent but a max HR is known, 60–70% of max HR (Garmin's default split).
- **Run threshold pace** (≈ one-hour race pace): from structured run blocks in the last 56 days, each block's average realised pace converted to one hour with **Riegel**: `pace × (60 / totalWorkMinutes)^0.06` — 2 × 20 min counts as 40 min, 6 × 800 m as ±19 min. Recency-weighted over the last four blocks. Without blocks: from **pace and heart rate** — speed scales roughly linearly with heart-rate reserve. Each run ≥ 20 min at ≥ 50% of heart-rate reserve gives `pace ÷ min(1.25, 1 / frac)` with `frac = (HR − RHR) / (LTHR − RHR)`; the last six (42 days) are averaged with weight `frac³`, so one run near threshold counts far more than easy runs that would need a long extrapolation. Confidence at most `gemiddeld`. **Max HR** = settings, else the *middle of the three highest* run peaks of the last 90 days (one optical-sensor spike must not count). **LTHR** = settings if below max HR, else 90% of max HR (deliberately cautious: a too-high LTHR makes the threshold too fast). RHR = latest Garmin value, else 55. Only without heart rate: the fastest one-hour equivalent of any run ≥ 20 min, confidence `laag`. (Taking the fastest training run alone badly underestimates someone whose runs were all easy.)
- **Run zone-2 pace**: long/easy runs in the last 42 days whose average HR was ≤ zone-2 top + 2, recency-weighted.
- **Long-run length**: median of the last three long runs (42 days).
- **Bike endurance speed**: outdoor endurance rides ≥ 45 min in the last 56 days (trainer speed is simulated and never counts), last six, recency-weighted, **wind-corrected**: `+ 0.25 × windKmh × (headShare − 0.7 × tailShare)` (headwind costs more than tailwind gives). Shares come from the km head/tail when known, else from the manual direction (tegen 0.7/0.2, mee 0.2/0.7, otherwise 0.4/0.4); wind speed from the ride or from the Beaufort midpoint. Without any wind data the confidence is capped at `gemiddeld`.
- **FTP**: entered by hand (`zelf ingevuld`), else estimated from the athlete's own power data (`geschat uit je vermogensdata`, see 8.9). Without a weight the power model cannot run: the bike leg then says to enter one.
- **Wind correction is 0 for indoor rides.**
- **Swim CSS**: realised pace of set reps of 100–400 m (last four blocks, 56 days); without sets, the average of whole sessions × 0.95 with confidence `laag`.

### 8.4 Week rhythm and prescriptions

**Week kind**: from `BLOCK_START` (5 Oct 2026) weeks are numbered 0, 1, 2…; week index `% 4 === 3` is a **rest week** (26 Oct, 23 Nov, 21 Dec, 18 Jan, 15 Feb, 15 Mar), the week of 5 April is **taper**, the week of 12 April **race**, everything else **build**. `weekFlags` overrides. **Build step** = number of build weeks before this week; rest weeks do not advance it. **Progress** `f` = position of the session's Monday between BLOCK_START and RACE_WEEK, 0…1. Volume factor per week kind: build 1, rest 0.65, taper 0.6, race 0.4.

Sessions dated **before BLOCK_START get no prescription** — September was the warm-up month.

**Toward the goal**: `toward(current, required, f)` = `current + (required − current) × f`, clamped to **at most 3% better than current fitness** (pace or speed). Targets never run ahead of the athlete by more than that.

Per kind (ladders advance one level every two build steps; rest/taper weeks drop two levels; race week uses the first):
- **Long run**: start = median long run at BLOCK_START, clamped 8–14 km; `km = min(cap, start + 0.5 × step)` with cap 16 km (phase 1) / 19 km (phase 2); never more than recent long-run median + 2 km; with no long run in 42 days, at most start + 1 km. Rest week × 0.7, taper ≤ 12, race week ≤ 6; rounded to 0.5 km, minimum 5. Goal = **HR within zone 2**; the zone-2 pace is shown only as an expectation.
- **Easy run**: `min(10 | 12 in phase 2, 6 + 0.25 × step) × factor` km, zone 2.
- **Threshold run**: 2×10 → 2×12 → 3×10 → 2×15 → 3×12 → 2×20 → 3×15 → 2×25 min at `toward(threshold, 4:15, f)`; rest 2 min (3 min for reps ≥ 15 min); 15 min warm-up, 10 min cool-down. Race week: race pace. No threshold yet → structure only, "op drempelgevoel", plus a hint.
- **Interval run**: 6×800 → 8×800 → 5×1000 → 6×1000 → 5×1200 → 4×1600 m at threshold target × 0.94 (±5K pace); rest 1:30 (≤800 m) or 2:00.
- **Bike endurance**: duration range per type (lange_fiets 90–150, korte_fiets 60–75, bike60 60, bike90 90–120, bike150 150–180 min); start from the recent median ride, +10 min per build step, × factor, rounded to 5. Intensity: 56–75% FTP when known, else bike zone 2 = run zone 2 − 7 bpm. Expected speed shown as "bij weinig wind".
- **Bike tempo**: 2×10 → 3×10 → 2×15 → 3×12 → 2×20 → 3×15 min at 85–90% FTP, else HR zone-2 top + 8…16; indicative speed = `toward(endurance × 1.10, 35.3, f, 4%)`.
- **Bike interval**: 5×4 → 6×4 → 5×5 → 4×6 min at 105% FTP (else HR > zone-2 top + 20), equal rest.
- **Swim sets**: 6×200 → 8×200 → 5×300 → 4×400 → 3×500 → 2×800 m at `toward(CSS, 1:55, f) + 2 s`, rest 20 s (≤200 m) / 30 s; 300 m warm-up, 200 m cool-down.
- **Swim continuous**: `min(2200, 1000 + 100 × step) × factor` m (≥ 800, rounded to 100) at CSS + 6 s.
- **Strength**: no prescription.

### 8.5 Did the session meet the prescription?

Only for done sessions. Each check yields hit / close / miss; the session's verdict is the worst of them:
- **Volume**: distance (run km, swim m) or duration (bike endurance) ≥ 95% → hit, ≥ 85% → close.
- **Heart rate** (long, easy, endurance): average HR ≤ zone-2 top + 2 → hit, + 7 → close, beyond → miss — so a long run at the right distance but too hard is a miss.
- **Blocks**: average realised pace vs target — as good or better → hit, within 3% → close; fewer reps than prescribed: one short → close, more → miss.
- Nothing measurable (only checked off) → hit with note "afgevinkt".

### 8.6 Race readiness

Speed alone does not say you can last five hours: someone who never rode further than 50 km or never ran off the bike will not hold the pace their short sessions suggest. Readiness measures, over the last 8 weeks (volume over 4), how much of the race load has been done: longest ride vs 90 km, longest run vs 18 km, longest swim vs 1,900 m, endurance hours per week (strength excluded) vs 8, and **bricks** (a ride and a run on the same day) vs 3. An indoor ride counts by duration: minutes ÷ 60 × outdoor endurance speed (27 km/h when unknown), not the trainer's simulated distance. Per leg, 0…1:
- bike = 0.7 × ride + 0.3 × volume
- run = 0.35 × ride + 0.3 × run + 0.2 × volume + 0.15 × bricks
- swim = swim

Each with a one-line explanation shown on the dashboard (`langste rit 51 km (race 90 km) · 4,7 u/week`, `… · nog nooit van de fiets af gelopen`).

**Adherence** = (completed ÷ planned endurance sessions, last 4 weeks) × min(1, sessions per week ÷ 5).

### 8.7 Finish-time model

Per leg from the markers of 8.3 (reference date = tomorrow, so today's sessions count):
- **Swim 1.9 km**: race pace = `(CSS + 4 s) × 1.03 × 0.95` (open-water sighting and chop; wetsuit — Valencia mid-April is 15–18 °C) × `(1 + 0.04 × (1 − readiness))`.
- **Bike 90 km**: with FTP and a known weight: speed on flat ground at **(68 + 8 × readiness)% of FTP** (CdA 0.30, Crr 0.005, ρ 1.225, 3% drivetrain loss, bike 9 kg). Otherwise **wind-corrected endurance speed × (1 + 0.12 × readiness)** — the full +12% (race intensity ±8% above zone 2, closed roads, no stops, aero, taper) only for someone used to the distance. On top, fatigue for the part beyond the longest ride: time × `(90 / longestKm)^0.05`.
- **Run 21.1 km**: `threshold ÷ 0.88` (≈ marathon pace — how well-prepared age-groupers run the 70.3 half marathon, 5–10% slower than an open half) × `(1 + 0.20 × (1 − readiness))`: getting off a 90 km ride you never did costs up to 20%. Without a threshold marker: zone-2 pace × 0.90, confidence `laag`.
- **Transitions**: 8 min.

**Margin** = `sqrt(Σ (legTime × u)²)` with u = 3% / 6% / 10% for hoog / gemiddeld / laag, plus `0.06 × (1 − readiness)`. **Projection to 18 April** ("als je het schema volgt, even trouw als de laatste 4 weken"): fitness — per leg the change over the last six weeks at fixed readiness, per week, clamped to ±1%/week, **halved**, extended over the weeks left; readiness — each gap to the race load (90 km, 18 km, 1,900 m, 8 h/week, 3 bricks) closed in proportion to adherence. The margin widens by 0.4% per week left. **Biggest gap** = the leg whose projected time exceeds its 5:00 split by the most minutes (> 0.5).

**What 5:00 asks** (goal card). Assumes full readiness: the question is whether you can become fast enough, not whether you can last. Weeks left = to the taper (5 April). Per leg, compared in speed so better is always up:
- swim: CSS vs 1:55 /100m; run: threshold vs 4:15 /km; gap = now ÷ need − 1;
- bike with FTP and weight: required FTP = the FTP at which 76% of it gives 35.3 km/h on the flat (bisection on the power model); gap = ∛(need ÷ now) − 1, since speed grows with the cube root of power. Otherwise endurance speed vs 35.3 ÷ 1.12 ≈ 31.5 km/h; gap = need ÷ now − 1.
- per week = (1 + gap)^(1/weeks) − 1, judged against what is attainable per week in speed: swim realistic 0.30% / ambitious 0.60% (technique pays off for novices), run 0.25% / 0.50%, bike 0.20% / 0.35%; above that `onwaarschijnlijk`. These are assumptions and the card says so.
- Realistic / ambitious goal = finish time at full readiness with each leg time ÷ (1 + rate)^weeks, never faster than its 5:00 split; legs already at 5:00 level do not grow.
- The leg that asks the most = highest per-week need relative to its ambitious rate.

This replaces the earlier model, which averaged all sessions of six weeks and therefore measured the training *mix* rather than fitness: more intervals looked "faster", a hard long run counted like an easy one, interval averages included the recovery jogs, and bike speed swung with the wind.

### 8.8 Trends, consistency, volume

- **Trend** markers: relative difference under 0.5% reads `≈ gelijk`; otherwise `▲ X% beter` / `▼ X% minder` (one decimal, comma), respecting the direction of the discipline.
- **Consistency** = completed ÷ planned over all of that person's sessions from 1 September 2026 up to (not including) today.
- **Training load** per week = `Σ (tijdMin × rpe)`, RPE defaulting to 5, strength excluded; the card shows only the trend.
- **Weekly volume** = `Σ tijdMin / 60` of completed non-strength sessions.
- Rolling window for weekly charts and side-activity sums: the last 12 weeks counted from `PANDA_START`.

### 8.9 Garmin sync via intervals.icu

Garmin offers no API to individuals; intervals.icu is an official Garmin Connect partner with a per-athlete API key (basic auth, user `API_KEY`). Per person two server-side env vars (`ICU_<PERSON>_API_KEY`, optional `ICU_<PERSON>_ATHLETE_ID`, default `0`). Strava is not used: its API terms forbid showing one athlete's data to anyone else, and intervals.icu returns Strava-sourced activities as empty stubs.

- **When**: on app load if the last sync is older than 15 minutes, via the `🔄 Garmin` button, and once a day by cron (authorised by a `CRON_SECRET` bearer token instead of the login cookie). Window: from `lastSync − 3 days` (first time: 1 September 2026) to today.
- **Activities**: run/trail/treadmill → run, (virtual/gravel/MTB) ride → fiets, (open-water) swim → zwem; anything else (including strength) is skipped, as are Strava stubs. Stats: `moving_time`/60, distance (m → km except swim), avg/max HR, elevation (not swim), average watts only if from a real power meter, RPE. Speed is left empty and derived.
- **Intervals → structure**, only for genuinely structured sessions. A watch makes an auto-lap every km (bike: 5 km) and intervals.icu reports those as WORK, so a long run would read as 16 × 1000 m. A WORK interval therefore only counts as a rep when a RECOVERY interval (≥ 20 s, swim ≥ 8 s, and slower than the rep) sits directly before or after it. Consecutive reps of similar length (±12% time or ±6% distance) form a block; blocks with a single rep are dropped; at most **two** blocks (largest total work time) are kept. A block is in distance or time, **whichever is rounder**. **Long, easy, endurance and continuous sessions never get a structure.** Intervals are fetched for new activities only; `?rebuild=1` refetches everything since 1 September and recomputes structures.
- **Structure from the pace stream** (runs only), when the laps give none — a watch set to auto-lap per km makes laps that cut straight through the reps. Fetch the `time`, `distance` and `heartrate` streams; speed per sample smoothed over ±10 s; below 1 m/s counts as standing still and is left out. Split fast from easy with Otsu's threshold on the moving samples. Fast stretches of ≥ 60 s are reps; an easy gap inside a rep of ≤ 30 s (≤ 45 s when you stood still: a traffic light) belongs to the rep; a rep more than 10% slower than the median rep (the end of the warm-up) is dropped. Only accepted when fast is ≥ 25% faster than easy, reps cover 10–80% of moving time, average HR in the reps is ≥ 2 bpm above the recoveries (on hills it is the other way round), and there are ≥ 2 reps. Before the first rep is warm-up, after the last cool-down; recoveries in between give the rest. Reps then go through the same block rules with ±25% tolerance (boundaries from a stream are less exact than laps). Rides are left out: their speed follows wind and hills.
- **Kind inference**: ≥2 work reps → threshold (median rep ≥ 8 min) or interval; else long (≥12 km or ≥70 min) or easy; rides tempo/interval/endurance likewise; swims sets/continuous.
- **Matching**: (1) same `externalId` → update (manual kind, structure and RPE kept); (2) else a session of the same person, date and discipline without `externalId` — planned or already entered by hand — preferring a matching kind and not-done; fill it, keeping its type and kind; (3) else create a new session with the palette type of that phase. Oldest activity first, each session claimed once.
- **Indoor**: a ride with `trainer` set or of type `VirtualRide` is marked indoor on creation and on matching, unless the session already carries a manual indoor value; no wind is stored for it.
- **Wind**: intervals.icu provides per ride `average_wind_speed` (m/s), `prevailing_wind_deg`, `headwind_percent`, `tailwind_percent` → km head/tail/cross and Beaufort; none on the trainer.
- **Wellness**: VO2max, resting HR, weight per day → one record per week (latest non-empty value per field); existing values are never overwritten with empty.
- **Zones**: zone 2 from the run sport-settings `hr_zones` (upper bounds; zone 2 = zones[0]+1 … zones[1]) unless set manually. A new intervals.icu account carries **defaults** (max 220, LTHR 200, FTP 250) unrelated to the athlete: heart-rate settings are only accepted when max HR ≤ observed robust max + 25 and 75% × max ≤ LTHR < max; the FTP in the settings is never taken over. FTP comes from `icu_rolling_ftp` of the newest ride with `device_watts` (a real power meter, e.g. the home trainer), and only when FTP was not entered by hand (`ftpSource`). Defaults taken over earlier are cleared. Count each session once (updated versions replace old ones) when computing the observed max.

### 8.10 Panda counter

Starting at the week of `PANDA_START` (Monday 31 August 2026), for every week that has **fully elapsed** (its Sunday is in the past) and is not after the race:

- `geneukt > 0` that week → **+1**
- otherwise → **−1**

The sum is the person's panda score, always displayed with an explicit sign. The three weekly counters themselves are just detail; only `geneukt` feeds the score.

### 8.11 Week numbering

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

**Status colours** for the hit/close/miss verdict map to good/warning/bad; week kinds: build neutral, rest light blue, taper amber, race ink. Trend markers use good/bad/muted. Red is reserved for genuinely negative states — it is never used for the panda counter or the side activities, which are neutral.

## 10. Interaction & accessibility

This is a laptop app. It does not need a phone or tablet layout — see section 11.

- **Planning must not require a drag gesture.** Click a palette type to select it, click a day to place it; drag-and-drop from the palette and between days works too, but is never the only way. The same goes for *moving* a session: the modal carries a date field, so a session can be rescheduled without dragging.
- Background refreshes must never steal focus or overwrite a field the user is currently editing — guard re-renders against in-progress input.
- Inputs, selects and buttons need visible focus states; the ± counter buttons and the palette items need real hit targets (≥32px) and accessible labels, since their visible content is a bare emoji or symbol.
- The countdown ticks every second: don't let it force a re-render of the whole page.
- The calendar is a wide table: give it its own horizontally scrollable container so a narrow browser window scrolls the table rather than breaking the page.

## 11. Explicitly out of scope for v1

- Per-user accounts, login, or roles — one shared password (or none) is fine.
- Strava as a data source (API terms forbid showing one athlete's data to the other) and Garmin's own API (not available to individuals).
- Pushing prescribed workouts to the watch.
- Editing the training-type catalogue, goals, key dates or the 5:00 split from the UI — fixed configuration (section 6).
- Real-time collaboration beyond "last write wins".
- Notifications, reminders, undo history, or edit history.
- A phone or tablet layout. Both users log their sessions on a laptop.
- Importing data from the previous HTML tracker. Older sessions are typed in by hand or come in through the Garmin sync.
- Support for other athletes, other races, or other distances.

## 12. Instructions to the coding assistant

1. Build the views, features and business logic in sections 4–8 using whatever the chosen template's idiomatic approach is for routing, state, persistence and styling. Do **not** replicate the previous implementation's technology: it was one 53KB HTML file with no framework, no build step, hand-rolled inline SVG charts and `localStorage`-only persistence. Satisfy the *behavioural* requirements in section 2 with the template's own data layer — a real table structure is preferable to one JSON blob if the template offers a database, and the template's chart library is preferable to hand-written SVG.
2. Treat section 6 as fixed configuration in code (a single module), not as user data, and section 8 as the specification for a small, separately testable calculation layer — pure functions over the data model in section 5, with no UI in them.
3. Write tests for section 8 at minimum: the hours:minutes rounding case (359.7 minutes → `6:00`, never `5:60`); block parsing and lossless round-trip; strength excluded from volume; the rest weeks landing on 26 Oct, 23 Nov, 21 Dec, 18 Jan, 15 Feb, 15 Mar and overrides; build steps not advancing in rest weeks; the 3% cap in `toward`; long-run ladder, rest-week cut, recent + 2 km cap and the reset after a gap; threshold via Riegel; wind correction; each finish-time leg, the projection cap and margin widening; the intervals.icu mapping on fixture data (track 6 × 800 m in distance, road 2 × 20 min in time, matching without duplicates on a second sync, Strava stubs skipped, wellness never overwriting with empty, zone 2 from `hr_zones`); and the panda counter across a part-elapsed week.
4. Apply the design system in section 9 through the template's native theming.
5. Meet the interaction and accessibility expectations in section 10 — particularly the no-drag path for planning and moving sessions.
6. Keep the intervals.icu key server-side only; the client learns just whether a person is connected.
7. Keep every piece of user-facing copy Dutch and informal, including empty states and error messages you have to invent, and keep the panda counter and side activities exactly as specified in section 2.
