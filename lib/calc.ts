import { BETTER, DEFAULT_KIND, PANDA_START, RACE, SEPT_FROM, TYPES } from './config';
import type { Block, Discipline, Kind, Person, State, Workout } from './types';

/**
 * Rekenlaag — sectie 8 van IRONMAN_PROMPT.md.
 * Alles hier is puur: functies over de state, geen UI, geen fetch.
 * De coëfficiënten zijn bewuste keuzes van de gebruikers; niet "verbeteren".
 */

/* ================= DATUM ================= */

export const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Maandag van de week waarin d valt. Weken lopen overal ma–zo. */
export function mondayOf(d: Date | string): Date {
  const x = typeof d === 'string' ? fromIso(d) : new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export const weekKeyOf = (d: Date | string) => iso(mondayOf(d));

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const todayIso = () => iso(new Date());

/** ISO-weeknummer: maandag-gebaseerd, week 1 bevat de eerste donderdag. */
export function weekNr(d: Date): number {
  const t = addDays(d, 3);
  const jan4 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round((((t as any) - (mondayOf(jan4) as any)) / 86400000 - 3) / 7);
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ================= FORMATTEREN ================= */

/** Decimale minuten -> "m:ss". */
export function fmtPace(v: number): string {
  let m = Math.floor(v);
  let s = Math.round((v - m) * 60);
  if (s === 60) {
    m++;
    s = 0;
  }
  return `${m}:${pad(s)}`;
}

export function unitOf(type: string): 'pace_km' | 'kmh' | 'pace_100' | null {
  const c = TYPES[type]?.cat;
  return c === 'run' ? 'pace_km' : c === 'fiets' ? 'kmh' : c === 'zwem' ? 'pace_100' : null;
}

export function fmtKmh(v: number): string {
  return v.toFixed(1).replace('.', ',') + ' km/u';
}

export function fmtSpeed(v: number | null | undefined, type: string): string {
  const u = unitOf(type);
  if (v == null || !u) return '';
  if (u === 'pace_km') return fmtPace(v) + ' /km';
  if (u === 'pace_100') return fmtPace(v) + ' /100m';
  return fmtKmh(v);
}

/** Decimale minuten -> "m:ss" of "h:mm:ss". */
export function fmtTijd(min: number | null | undefined): string {
  if (min == null) return '';
  const t = Math.round(min * 60);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Minuten -> "h:mm".
 * LET OP: eerst het totaal afronden, dán delen. Andersom levert 359,7 minuten
 * "5:60" op — die regressie is er ooit geweest, zie de test.
 */
export function fmtHM(min: number): string {
  const t = Math.round(min);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}:${pad(m)}`;
}

export const fmtSigned = (n: number) => (n > 0 ? '+' : '') + n;
export const fmtDec = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

/* ================= INLEZEN ================= */

/** "45:00" | "1:20:30" | "45" -> decimale minuten. */
export function parseTijd(str: string | null | undefined): number | null {
  if (!str) return null;
  const p = str.trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 1) return p[0];
  if (p.length === 2) return p[0] + p[1] / 60;
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
  return null;
}

/** "5:30" voor tempo, "31,4" of "31.4" voor km/u. */
export function parseSpeed(str: string | null | undefined, type: string): number | null {
  if (!str) return null;
  const u = unitOf(type);
  if (u === 'kmh') {
    const v = parseFloat(str.replace(',', '.'));
    return isNaN(v) ? null : v;
  }
  const p = str.trim().split(':').map(Number);
  if (p.length === 2 && !p.some(isNaN)) return p[0] + p[1] / 60;
  const v = parseFloat(str.replace(',', '.'));
  return isNaN(v) ? null : v;
}

export function parseNum(str: string | null | undefined): number | null {
  if (str == null || str === '') return null;
  const v = parseFloat(String(str).replace(',', '.'));
  return isNaN(v) ? null : v;
}

/* ================= SNELHEID ================= */

/**
 * Expliciet ingevulde snelheid, anders afgeleid uit tijd + afstand.
 * Zonder bruikbare snelheid telt een training nergens in mee.
 */
export function derivedSpeed(w: Workout): number | null {
  const s = w.stats || {};
  const cat = TYPES[w.type]?.cat;
  if (s.snelheid != null) return s.snelheid;
  if (s.tijdMin && s.afstand) {
    if (cat === 'run') return s.tijdMin / s.afstand;
    if (cat === 'fiets') return s.afstand / (s.tijdMin / 60);
    if (cat === 'zwem') return s.tijdMin / (s.afstand / 100);
  }
  return null;
}

export function workoutsOf(state: State, person: Person): Workout[] {
  return Object.values(state.workouts).filter((w) => w.person === person);
}

export function doneWorkouts(
  state: State,
  person: Person,
  cat?: Discipline
): Workout[] {
  return workoutsOf(state, person)
    .filter((w) => (!cat || TYPES[w.type]?.cat === cat) && w.stats?.done)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ================= VORM & TRENDS ================= */

export type Trend = { kind: 'up' | 'down' | 'flat' | 'none'; pct?: string };

export function trend(
  recent: number | null | undefined,
  prev: number | null | undefined,
  cat: Discipline
): Trend {
  if (recent == null || prev == null) return { kind: 'none' };
  if (Math.abs(recent - prev) / prev < 0.005) return { kind: 'flat' };
  const better =
    BETTER[cat as 'run' | 'fiets' | 'zwem'] === 'low' ? recent < prev : recent > prev;
  const pct = fmtDec(Math.abs(((recent - prev) / prev) * 100));
  return { kind: better ? 'up' : 'down', pct };
}

/* ================= WEKEN, VOLUME, PANDA ================= */

/** De laatste 12 (deels) verstreken weken sinds PANDA_START, als weeksleutels. */
export function weeksSoFar(limit = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  let wk = new Date(PANDA_START);
  while (wk <= now && wk <= RACE) {
    out.push(iso(wk));
    wk = addDays(wk, 7);
  }
  return out.slice(-limit);
}

export function weekVolume(state: State, person: Person, weekKey: string): number {
  const end = iso(addDays(fromIso(weekKey), 7));
  return (
    doneWorkouts(state, person)
      .filter((w) => w.date >= weekKey && w.date < end && !isStrength(w))
      .reduce((a, w) => a + (w.stats?.tijdMin || 0), 0) / 60
  );
}

/** Trainingsload: Σ (tijd × RPE), RPE valt terug op 5. */
export function weekLoad(state: State, person: Person, weekKey: string): number {
  const end = iso(addDays(fromIso(weekKey), 7));
  return doneWorkouts(state, person)
    .filter((w) => w.date >= weekKey && w.date < end && !isStrength(w))
    .reduce((a, w) => a + (w.stats?.tijdMin || 0) * (w.stats?.rpe || 5), 0);
}

/** Afgevinkt van gepland, over alles vanaf 1 september tot vandaag. */
export function consistency(state: State, person: Person): number | null {
  const today = todayIso();
  const planned = workoutsOf(state, person).filter(
    (w) => w.date < today && w.date >= SEPT_FROM
  );
  if (!planned.length) return null;
  const done = planned.filter((w) => w.stats?.done).length;
  return Math.round((done / planned.length) * 100);
}

/**
 * Panda counter: per volledig verstreken week vanaf PANDA_START
 * geneukt > 0 -> +1, anders -1.
 */
export function pandaScore(state: State, person: Person): number {
  let score = 0;
  const now = new Date();
  let wk = new Date(PANDA_START);
  while (true) {
    const sunEnd = addDays(wk, 7);
    if (sunEnd > now || wk > RACE) break;
    const rec = state.weekly[person]?.[iso(wk)];
    score += rec && rec.geneukt > 0 ? 1 : -1;
    wk = addDays(wk, 7);
  }
  return score;
}

export function weekRec(state: State, person: Person, weekKey: string) {
  return state.weekly[person]?.[weekKey] ?? { rek: 0, zuipen: 0, geneukt: 0 };
}

export function garminRec(state: State, person: Person, weekKey: string) {
  return state.garmin[person]?.[weekKey] ?? {};
}

/* ================= SOORT & STRUCTUUR ================= */

export const catOf = (w: Pick<Workout, 'type'>): Discipline => TYPES[w.type]?.cat ?? 'kracht';

export const isStrength = (w: Pick<Workout, 'type'>) => catOf(w) === 'kracht';

/** De soort van een sessie; sessies van vóór oktober vallen terug op hun type. */
export function kindOf(w: Pick<Workout, 'type' | 'kind'>): Kind {
  return (w.kind as Kind) || DEFAULT_KIND[w.type] || 'easy';
}

/** "800 m", "1,2 km", "20 min", "45 s" voor het werkdeel van een blok. */
export function fmtWork(b: Block): string {
  if (b.workDistM) {
    return b.workDistM >= 1000
      ? fmtDec(b.workDistM / 1000, b.workDistM % 1000 ? 1 : 0) + ' km'
      : `${Math.round(b.workDistM)} m`;
  }
  if (b.workDurS) return fmtDur(b.workDurS);
  return '?';
}

/** Seconden → "20 min", "1:30", "45 s". */
export function fmtDur(s: number): string {
  if (s >= 600 && s % 60 === 0) return `${s / 60} min`;
  if (s >= 60) return `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
  return `${Math.round(s)} s`;
}

/** Gemiddelde van de gerealiseerde herhalingen van een blok, of null. */
export function blockActualAvg(b: Block): number | null {
  const v = (b.actual ?? []).filter((x): x is number => x != null && x > 0);
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
}

/** Kort, voor op het kaartje: "6×800 m · gem. 3:58 /km". */
export function structureSummary(blocks: Block[] | null | undefined, type: string): string {
  if (!blocks?.length) return '';
  const parts = blocks.map((b) => {
    const head = `${b.reps}×${fmtWork(b)}`;
    const avg = blockActualAvg(b);
    if (avg != null) return `${head} · gem. ${fmtSpeed(avg, type)}`;
    if (b.speed != null) return `${head} @ ${fmtSpeed(b.speed, type)}`;
    if (b.watts != null) return `${head} @ ${b.watts} W`;
    return head;
  });
  return parts.join(' + ');
}

/** "800", "800m", "1,2 km", "1.2km" → meters. Kaal getal onder 50 = km. */
export function parseDistM(str: string | null | undefined): number | null {
  if (!str) return null;
  const t = str.trim().toLowerCase().replace(',', '.');
  const n = parseFloat(t);
  if (isNaN(n) || n <= 0) return null;
  if (t.endsWith('km')) return n * 1000;
  if (t.endsWith('m')) return n;
  return n < 50 ? n * 1000 : n;
}

/** "20", "20 min", "20:00", "1:30", "90 s" → seconden. Kaal getal = minuten. */
export function parseDurS(str: string | null | undefined): number | null {
  if (!str) return null;
  const t = str.trim().toLowerCase().replace(',', '.');
  if (t.includes(':')) {
    const p = t.split(':').map(Number);
    if (p.some(isNaN)) return null;
    return p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
  }
  const n = parseFloat(t);
  if (isNaN(n) || n <= 0) return null;
  if (t.includes('min')) return n * 60;
  if (/\d\s*(s|sec|seconden)$/.test(t)) return n;
  return n * 60;
}

/**
 * Hoogste waarde zonder uitschieters: de middelste van de drie hoogste.
 * Een polssensor meet soms één piek (207 bpm) die er niet was; die mag geen
 * omslagpunt of zones bepalen. Minder dan drie waarden: null.
 */
export function robustMax(xs: number[]): number | null {
  const top = xs.filter((x) => x > 0).sort((a, b) => b - a).slice(0, 3);
  return top.length === 3 ? top[1] : null;
}
