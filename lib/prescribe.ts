import {
  BLOCK_START,
  GOAL_SPLITS,
  PHASE2_FROM,
  RACE_DIST,
  RACE_WEEK,
  TAPER_WEEK
} from './config';
import {
  addDays,
  blockActualAvg,
  catOf,
  derivedSpeed,
  fmtDec,
  fmtDur,
  fmtPace,
  fromIso,
  iso,
  kindOf,
  mondayOf
} from './calc';
import { anchors, type Anchors } from './fitness';
import type { Block, Kind, State, WeekKind, Workout } from './types';

/**
 * Voorschriften: per geplande training afstand of duur, tempo of hartslag en
 * de opbouw — berekend uit de huidige fitheid (fitness.ts), het weekritme en
 * wat sub-5 vraagt. Puur; geen UI.
 */

/* ================= weekritme ================= */

const WEEK_MS = 7 * 86400000;

/** Weeknummer vanaf de eerste opbouwweek (5 okt = 0). */
export function weekIndex(date: Date | string): number {
  return Math.floor((+mondayOf(date) - +BLOCK_START) / WEEK_MS);
}

/** Standaardritme: 3 weken opbouw, 1 rustweek; dan taper en raceweek. */
export function defaultWeekKind(date: Date | string): WeekKind {
  const m = mondayOf(date);
  if (+m >= +RACE_WEEK) return 'race';
  if (+m >= +TAPER_WEEK) return 'taper';
  const i = weekIndex(m);
  return i >= 0 && i % 4 === 3 ? 'rest' : 'build';
}

export function weekKind(state: State, date: Date | string): WeekKind {
  return state.weekFlags[iso(mondayOf(date))] ?? defaultWeekKind(date);
}

/** Aantal opbouwweken vóór deze week. Rustweken zetten de ladder niet verder. */
export function buildStep(state: State, date: Date | string): number {
  const end = weekIndex(date);
  let n = 0;
  for (let i = 0; i < end; i++) {
    if (weekKind(state, addDays(BLOCK_START, i * 7)) === 'build') n++;
  }
  return n;
}

/** Fractie van de weg van 5 okt naar de raceweek (0 … 1). */
export function progress(date: Date | string): number {
  const f = (+mondayOf(date) - +BLOCK_START) / (+RACE_WEEK - +BLOCK_START);
  return Math.min(1, Math.max(0, f));
}

/** Volumefactor per weektype. */
export const WEEK_SCALE: Record<WeekKind, number> = { build: 1, rest: 0.65, taper: 0.6, race: 0.4 };

/* ================= wat sub-5 vraagt ================= */

export const REQUIRED = {
  /** Racetempo halve marathon, min/km. */
  runPace: GOAL_SPLITS.run / RACE_DIST.runKm,
  /** 70.3-runs liggen op ±88% van de drempelsnelheid → drempel = racetempo × 0,88. */
  runThreshold: (GOAL_SPLITS.run / RACE_DIST.runKm) * 0.88,
  bikeKmh: RACE_DIST.fietsKm / (GOAL_SPLITS.fiets / 60),
  /** Racetempo zwemmen, min/100m (in wetsuit, open water). */
  swimPace: GOAL_SPLITS.zwem / (RACE_DIST.zwemM / 100),
  /** Bijbehorende CSS: race = (CSS + 4 s) × 1,03 (open water) × 0,95 (wetsuit). */
  swimCss: GOAL_SPLITS.zwem / (RACE_DIST.zwemM / 100) / (1.03 * 0.95) - 4 / 60
};

/**
 * Van huidige naar vereiste waarde, naar rato van de tijd tot de race, maar
 * nooit meer dan `maxStep` (3%) voor je huidige fitheid uit. Werkt voor tempo
 * (lager is beter) en snelheid (hoger is beter).
 */
export function toward(current: number, required: number, f: number, maxStep = 0.03): number {
  const t = current + (required - current) * f;
  const lo = current * (1 - maxStep);
  const hi = current * (1 + maxStep);
  return Math.min(hi, Math.max(lo, t));
}

/* ================= ladders ================= */

/** [herhalingen, minuten] per niveau; elke twee opbouwweken een niveau hoger. */
const THRESHOLD: [number, number][] = [[2, 10], [2, 12], [3, 10], [2, 15], [3, 12], [2, 20], [3, 15], [2, 25]];
/** [herhalingen, meters]. */
const INTERVAL: [number, number][] = [[6, 800], [8, 800], [5, 1000], [6, 1000], [5, 1200], [4, 1600]];
const BIKE_TEMPO: [number, number][] = [[2, 10], [3, 10], [2, 15], [3, 12], [2, 20], [3, 15]];
const BIKE_INTERVAL: [number, number][] = [[5, 4], [6, 4], [5, 5], [4, 6]];
const SWIM_SETS: [number, number][] = [[6, 200], [8, 200], [5, 300], [4, 400], [3, 500], [2, 800]];

/** Minuten per fietstype: [start, max]. */
const BIKE_RANGE: Record<string, [number, number]> = {
  lange_fiets: [90, 150],
  korte_fiets: [60, 75],
  bike60: [60, 60],
  bike90: [90, 120],
  bike150: [150, 210] // tot 3,5 uur: minstens één keer de race-afstand gereden voor de taper
};

function level<T>(ladder: T[], step: number, wk: WeekKind): T {
  let i = Math.floor(step / 2);
  if (wk === 'rest' || wk === 'taper') i -= 2;
  if (wk === 'race') i = 0;
  return ladder[Math.min(ladder.length - 1, Math.max(0, i))];
}

const round = (v: number, step: number) => Math.round(v / step) * step;

/** 14 → "14", 14.5 → "14,5". */
const fmtKm = (v: number) => (v % 1 ? fmtDec(v, 1) : String(Math.round(v)));

/* ================= voorschrift ================= */

export type Prescription = {
  kind: Kind;
  weekKind: WeekKind;
  /** Kort, voor op het kaartje. */
  summary: string;
  /** Langer, voor in de modal. */
  details: string[];
  distKm?: number;
  distM?: number;
  durMin?: number;
  hrMax?: number | null;
  hrMin?: number | null;
  /** Verwachte snelheid/tempo — bij long runs nadrukkelijk géén doel. */
  expect?: number | null;
  blocks?: Block[];
  /** Waar het op rust. */
  basis: string[];
  /** Wat er ontbreekt om het voorschrift scherper te maken. */
  missing?: string;
};

export function prescribe(state: State, w: Workout): Prescription | null {
  const cat = catOf(w);
  if (cat === 'kracht') return null;
  // september was warm-up: het coachen begint in de week van 5 oktober
  if (fromIso(w.date) < BLOCK_START) return null;
  const kind = kindOf(w);
  const wk = weekKind(state, w.date);
  const step = buildStep(state, w.date);
  const f = progress(w.date);
  const a = anchors(state, w.person, w.date);
  const scale = WEEK_SCALE[wk];
  const phase2 = fromIso(w.date) >= PHASE2_FROM;

  if (cat === 'run') {
    if (kind === 'long') return longRun(state, w, a, wk, step, phase2);
    if (kind === 'easy') return easyRun(a, wk, step, scale, phase2);
    if (kind === 'threshold') return thresholdRun(a, wk, step, f);
    return intervalRun(a, wk, step, f);
  }
  if (cat === 'fiets') {
    if (kind === 'endurance') return bikeEndurance(w, a, wk, step, scale);
    if (kind === 'interval') return bikeInterval(a, wk, step);
    return bikeTempo(a, wk, step, f);
  }
  if (kind === 'sets') return swimSets(a, wk, step, f);
  return swimContinuous(a, wk, step, scale);
}

/* ---------- hardlopen ---------- */

const hrCap = (a: Anchors) => (a.z2.high ? `♥ ≤ ${a.z2.high}` : 'zone 2');
const zoneMissing = (a: Anchors) =>
  a.z2.high ? undefined : 'Stel je zone 2 in (dashboard → Garmin) voor een hartslaggrens.';

/** Long run: lengte groeit, intensiteit blijft zone 2. Tempo is een verwachting, geen doel. */
function longRun(
  state: State,
  w: Workout,
  a: Anchors,
  wk: WeekKind,
  step: number,
  phase2: boolean
): Prescription {
  const start = anchors(state, w.person, iso(BLOCK_START)).longRunKm?.value ?? 10;
  const cap = phase2 ? 19 : 16;
  let km = Math.min(cap, Math.min(14, Math.max(8, start)) + 0.5 * step);
  // nooit meer dan 2 km boven wat je recent echt gelopen hebt; na een gat
  // van zes weken zonder long run begin je weer vooraan
  if (a.longRunKm) km = Math.min(km, a.longRunKm.value + 2);
  else km = Math.min(km, Math.max(8, Math.min(14, start)) + 1);
  if (wk === 'rest') km *= 0.7;
  if (wk === 'taper') km = Math.min(km, 12);
  if (wk === 'race') km = Math.min(km, 6);
  km = Math.max(5, round(km, 0.5));

  return {
    kind: 'long',
    weekKind: wk,
    distKm: km,
    hrMin: a.z2.low,
    hrMax: a.z2.high,
    expect: a.runZ2?.value ?? null,
    summary: `${fmtKm(km)} km · ${hrCap(a)}`,
    details: [
      `${fmtKm(km)} km rustig, de hele run in zone 2${a.z2.high ? ` (${a.z2.low ?? '?'}–${a.z2.high} bpm)` : ''}.`,
      a.runZ2
        ? `Verwacht tempo bij die hartslag: ±${fmtPace(a.runZ2.value)} /km — dat is een verwachting, geen doel. Loopt de hartslag op, dan ga je langzamer.`
        : 'Tempo volgt uit je hartslag; daar is nog geen meting voor.',
      wk === 'rest' ? 'Rustweek: korter dan vorige week.' : ''
    ].filter(Boolean),
    basis: [...(a.longRunKm?.basis.map((b) => `long run ${b}`) ?? []), ...(a.runZ2?.basis ?? [])],
    missing: zoneMissing(a)
  };
}

function easyRun(a: Anchors, wk: WeekKind, step: number, scale: number, phase2: boolean): Prescription {
  const km = Math.max(4, round(Math.min(phase2 ? 12 : 10, 6 + 0.25 * step) * scale, 0.5));
  return {
    kind: 'easy',
    weekKind: wk,
    distKm: km,
    hrMin: a.z2.low,
    hrMax: a.z2.high,
    expect: a.runZ2?.value ?? null,
    summary: `${fmtKm(km)} km · ${hrCap(a)}`,
    details: [`${fmtKm(km)} km ontspannen in zone 2. Herstel, geen training.`],
    basis: a.runZ2?.basis ?? [],
    missing: zoneMissing(a)
  };
}

function runTarget(a: Anchors, f: number) {
  return a.runThreshold ? toward(a.runThreshold.value, REQUIRED.runThreshold, f) : null;
}

function thresholdRun(a: Anchors, wk: WeekKind, step: number, f: number): Prescription {
  const [reps, min] = level(THRESHOLD, step, wk);
  const target = wk === 'race' ? REQUIRED.runPace : runTarget(a, f);
  const restS = min >= 15 ? 180 : 120;
  const block: Block = { reps, workDurS: min * 60, speed: target, restDurS: restS };
  const easy = a.runZ2?.value ?? 6;
  const km = round(25 / easy + (target ? (reps * min) / target : 0), 0.5);
  const at = target ? ` @ ${fmtPace(target)} /km` : ' op drempelgevoel';
  return {
    kind: 'threshold',
    weekKind: wk,
    blocks: [block],
    distKm: km,
    summary: `${reps}×${min} min${at}`,
    details: [
      '15 min inlopen.',
      `${reps} × ${min} min${at}, ${fmtDur(restS)} wandel- of dribbelrust ertussen.`,
      '10 min uitlopen.',
      target
        ? `Doel ligt op ${fmtPace(target)}: ${a.runThreshold ? `je drempel is nu ±${fmtPace(a.runThreshold.value)}` : ''}, sub-5 vraagt ±${fmtPace(REQUIRED.runThreshold)}.`
        : ''
    ].filter(Boolean),
    basis: a.runThreshold?.basis ?? [],
    missing: target ? undefined : 'Nog geen drempeltempo: loop op "comfortabel zwaar" en vul je tempo per herhaling in.'
  };
}

function intervalRun(a: Anchors, wk: WeekKind, step: number, f: number): Prescription {
  const [reps, m] = level(INTERVAL, step, wk);
  const thr = runTarget(a, f);
  // ±5K-tempo ligt zo'n 6% onder drempeltempo
  const target = thr ? thr * 0.94 : null;
  const restS = m <= 800 ? 90 : 120;
  const block: Block = { reps, workDistM: m, speed: target, restDurS: restS };
  const easy = a.runZ2?.value ?? 6;
  const km = round(25 / easy + (reps * m) / 1000, 0.5);
  const at = target ? ` @ ${fmtPace(target)} /km` : ' op 5K-gevoel';
  return {
    kind: 'interval',
    weekKind: wk,
    blocks: [block],
    distKm: km,
    summary: `${reps}×${m} m${at}`,
    details: [
      '15 min inlopen met een paar versnellingen.',
      `${reps} × ${m} m${at}, ${fmtDur(restS)} rust (dribbelen).`,
      '10 min uitlopen.'
    ],
    basis: a.runThreshold?.basis ?? [],
    missing: target ? undefined : 'Nog geen drempeltempo: loop op 5K-gevoel en vul je tempo per herhaling in.'
  };
}

/* ---------- fietsen ---------- */

/** Fiets-HR ligt doorgaans 5–10 slagen lager dan bij hardlopen. */
const bikeZ2 = (a: Anchors) =>
  a.z2.high ? { low: a.z2.low ? a.z2.low - 7 : null, high: a.z2.high - 7 } : null;

function bikeEndurance(w: Workout, a: Anchors, wk: WeekKind, step: number, scale: number): Prescription {
  const [lo, hi] = BIKE_RANGE[w.type] ?? [60, 120];
  const start = Math.min(hi, Math.max(lo, a.bikeEnduranceMin?.value ?? lo));
  const min = Math.max(45, round(Math.min(hi, start + 10 * step) * scale, 5));
  const z = bikeZ2(a);
  const ftp = a.ftp?.value;
  const intensity = ftp
    ? `${Math.round(ftp * 0.56)}–${Math.round(ftp * 0.75)} W`
    : z
      ? `♥ ≤ ${z.high}`
      : 'zone 2';
  return {
    kind: 'endurance',
    weekKind: wk,
    durMin: min,
    hrMin: z?.low ?? null,
    hrMax: z?.high ?? null,
    expect: a.bikeEndurance?.value ?? null,
    summary: `${min} min · ${intensity}`,
    details: [
      `${min} min duur, ${intensity}.`,
      a.bikeEndurance
        ? `Verwacht ±${fmtDec(a.bikeEndurance.value)} km/u bij weinig wind. Wind bepaalt de snelheid, hartslag de inspanning.`
        : ''
    ].filter(Boolean),
    basis: [...(a.bikeEndurance?.basis ?? []), ...(a.ftp?.basis ?? [])],
    missing: z || ftp ? undefined : zoneMissing(a)
  };
}

function bikeTempo(a: Anchors, wk: WeekKind, step: number, f: number): Prescription {
  const [reps, min] = level(BIKE_TEMPO, step, wk);
  const ftp = a.ftp?.value;
  // tempo/sweet spot ligt ±10% boven je duursnelheid; we bouwen richting racesnelheid
  const speed = a.bikeEndurance
    ? toward(a.bikeEndurance.value * 1.1, REQUIRED.bikeKmh, f, 0.04)
    : null;
  const z = bikeZ2(a);
  const intensity = ftp
    ? `${Math.round(ftp * 0.85)}–${Math.round(ftp * 0.9)} W`
    : z
      ? `♥ ${z.high + 8}–${z.high + 16}`
      : 'zwaar maar vol te houden';
  const block: Block = {
    reps,
    workDurS: min * 60,
    speed,
    watts: ftp ? Math.round(ftp * 0.88) : null,
    restDurS: min >= 15 ? 300 : 240
  };
  return {
    kind: 'tempo',
    weekKind: wk,
    blocks: [block],
    durMin: 20 + reps * min + (reps - 1) * (block.restDurS! / 60) + 10,
    summary: `${reps}×${min} min · ${intensity}`,
    details: [
      '20 min inrijden.',
      `${reps} × ${min} min op ${intensity}${speed ? ` (±${fmtDec(speed)} km/u bij weinig wind)` : ''}, ${fmtDur(block.restDurS!)} rustig ertussen.`,
      '10 min uitrijden.'
    ],
    basis: [...(a.bikeEndurance?.basis ?? []), ...(a.ftp?.basis ?? [])]
  };
}

function bikeInterval(a: Anchors, wk: WeekKind, step: number): Prescription {
  const [reps, min] = level(BIKE_INTERVAL, step, wk);
  const ftp = a.ftp?.value;
  const z = bikeZ2(a);
  const intensity = ftp ? `${Math.round(ftp * 1.05)} W` : z ? `♥ > ${z.high + 20}` : 'hard';
  return {
    kind: 'interval',
    weekKind: wk,
    blocks: [{ reps, workDurS: min * 60, watts: ftp ? Math.round(ftp * 1.05) : null, restDurS: min * 60 }],
    durMin: 20 + reps * min * 2 + 10,
    summary: `${reps}×${min} min · ${intensity}`,
    details: [`20 min inrijden, ${reps} × ${min} min ${intensity} met even lang rustig ertussen, 10 min uitrijden.`],
    basis: a.ftp?.basis ?? []
  };
}

/* ---------- zwemmen ---------- */

function swimSets(a: Anchors, wk: WeekKind, step: number, f: number): Prescription {
  const [reps, m] = level(SWIM_SETS, step, wk);
  const cssT = a.css ? toward(a.css.value, REQUIRED.swimCss, f) : null;
  const pace = cssT ? cssT + 2 / 60 : null;
  const restS = m <= 200 ? 20 : 30;
  // inzwemmen meet je niet mee: telt niet in de afstand (en dus niet in het oordeel)
  const total = reps * m + 200;
  const at = pace ? ` @ ${fmtPace(pace)} /100m` : '';
  return {
    kind: 'sets',
    weekKind: wk,
    blocks: [{ reps, workDistM: m, speed: pace, restDurS: restS }],
    distM: total,
    summary: `${reps}×${m} m${at}`,
    details: [
      'Inzwemmen: ±300 m rustig, telt niet mee.',
      `${reps} × ${m} m${at}, ${restS} s rust aan de kant.`,
      '200 m uitzwemmen.',
      `Totaal ${total} m, zonder het inzwemmen.`
    ],
    basis: a.css?.basis ?? [],
    missing: pace ? undefined : 'Nog geen CSS: zwem de herhalingen op gevoel en vul je tijd per herhaling in.'
  };
}

function swimContinuous(a: Anchors, wk: WeekKind, step: number, scale: number): Prescription {
  const m = Math.max(800, round(Math.min(2200, 1000 + 100 * step) * scale, 100));
  const pace = a.css ? a.css.value + 6 / 60 : null;
  const at = pace ? ` @ ${fmtPace(pace)} /100m` : '';
  return {
    kind: 'continuous',
    weekKind: wk,
    distM: m,
    expect: pace,
    summary: `${m} m doorzwemmen${at}`,
    details: [`${m} m aan één stuk${at}. Oefen oriënteren: elke 6–8 slagen even vooruit kijken.`],
    basis: a.css?.basis ?? []
  };
}

/* ================= gehaald? ================= */

export type Verdict = 'hit' | 'close' | 'miss';
export type Compliance = { verdict: Verdict; notes: string[] };

const worst = (vs: Verdict[]): Verdict =>
  vs.includes('miss') ? 'miss' : vs.includes('close') ? 'close' : 'hit';

/** Hoe goed de uitgevoerde training het voorschrift volgde. */
export function compliance(w: Workout, p: Prescription): Compliance | null {
  if (!w.stats?.done) return null;
  const s = w.stats;
  const notes: string[] = [];
  const vs: Verdict[] = [];
  const cat = catOf(w);

  // volume
  if (p.distKm && s.afstand) {
    const r = s.afstand / p.distKm;
    vs.push(r >= 0.95 ? 'hit' : r >= 0.85 ? 'close' : 'miss');
    notes.push(`${fmtKm(s.afstand)} van ${fmtKm(p.distKm)} km`);
  }
  if (p.distM && s.afstand && cat === 'zwem') {
    const r = s.afstand / p.distM;
    vs.push(r >= 0.95 ? 'hit' : r >= 0.85 ? 'close' : 'miss');
    notes.push(`${Math.round(s.afstand)} van ${p.distM} m`);
  }
  if (p.durMin && s.tijdMin && p.kind === 'endurance') {
    const r = s.tijdMin / p.durMin;
    vs.push(r >= 0.95 ? 'hit' : r >= 0.85 ? 'close' : 'miss');
    notes.push(`${Math.round(s.tijdMin)} van ${p.durMin} min`);
  }

  // hartslag bij zone-2-trainingen
  if (p.hrMax && s.gemHr && ['long', 'easy', 'endurance'].includes(p.kind)) {
    const over = s.gemHr - p.hrMax;
    vs.push(over <= 2 ? 'hit' : over <= 7 ? 'close' : 'miss');
    notes.push(over <= 2 ? `♥ ${s.gemHr}, in zone 2` : `♥ ${s.gemHr}, ${over} boven zone 2`);
  }

  // tempo per blok
  const target = p.blocks?.[0];
  const done = w.structure?.[0];
  if (target?.speed && done) {
    const avg = blockActualAvg(done);
    if (avg) {
      const lowerIsBetter = cat !== 'fiets';
      const ok = lowerIsBetter ? avg <= target.speed : avg >= target.speed;
      const close = lowerIsBetter ? avg <= target.speed * 1.03 : avg >= target.speed * 0.97;
      vs.push(ok ? 'hit' : close ? 'close' : 'miss');
      const unit = cat === 'fiets' ? ' km/u' : cat === 'zwem' ? ' /100m' : ' /km';
      const fmt = (v: number) => (cat === 'fiets' ? fmtDec(v) : fmtPace(v));
      notes.push(`gem. ${fmt(avg)}${unit} (doel ${fmt(target.speed)})`);
    }
    // minder herhalingen is alleen erg als je ook minder wérk deed: 5 × 300 m
    // is meer dan 6 × 200 m. Bij zwemmen telt ook de totale afstand.
    const unitOf = (b: Block) => (target.workDistM ? b.workDistM : target.workDurS ? b.workDurS : null) ?? 0;
    const targetWork = target.reps * unitOf(target);
    const doneWork = (w.structure ?? []).reduce((x, b) => x + b.reps * unitOf(b), 0);
    const enoughWork = targetWork > 0 && doneWork >= 0.95 * targetWork;
    const enoughSwim = cat === 'zwem' && !!p.distM && !!s.afstand && s.afstand >= 0.95 * p.distM;
    if (done.reps < target.reps && !enoughWork && !enoughSwim) {
      vs.push(done.reps >= target.reps - 1 ? 'close' : 'miss');
      notes.push(`${done.reps} van ${target.reps} herhalingen`);
    }
  }

  // niets te meten: alleen afgevinkt
  if (!vs.length) {
    const spd = derivedSpeed(w);
    if (!spd && !s.tijdMin) return { verdict: 'hit', notes: ['afgevinkt'] };
    return null;
  }
  return { verdict: worst(vs), notes };
}

export const WEEK_LABEL: Record<WeekKind, string> = {
  build: 'opbouw',
  rest: 'rustweek',
  taper: 'taper',
  race: 'raceweek'
};

/** Voor de weekkolom: welk weektype, en of het afwijkt van het ritme. */
export function weekInfo(state: State, monday: Date) {
  const kind = weekKind(state, monday);
  return { kind, overridden: kind !== defaultWeekKind(monday), index: weekIndex(monday) };
}

