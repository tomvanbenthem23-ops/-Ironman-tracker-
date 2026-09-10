import {
  BETTER,
  DISC_REF,
  GOAL_MIN,
  PANDA_START,
  RACE,
  SEPT_FROM,
  SEPT_TO,
  T0,
  T1,
  TARGET_FROM,
  TYPES
} from './config';
import type { Discipline, Person, State, Workout } from './types';

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

export function fmtSpeedCat(v: number | null | undefined, cat: Discipline): string {
  if (v == null) return '—';
  if (cat === 'run') return fmtPace(v) + ' /km';
  if (cat === 'zwem') return fmtPace(v) + ' /100m';
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

type SpeedPoint = { d: string; v: number; hr?: number | null };

export function speedsOf(list: Workout[]): SpeedPoint[] {
  const out: SpeedPoint[] = [];
  for (const w of list) {
    const v = derivedSpeed(w);
    if (v != null) out.push({ d: w.date, v, hr: w.stats?.gemHr ?? null });
  }
  return out;
}

/* ================= TARGETS ================= */

function septAvg(
  state: State,
  person: Person,
  filter: (w: Workout) => boolean
): number | null {
  const vals = workoutsOf(state, person)
    .filter((w) => w.date >= SEPT_FROM && w.date <= SEPT_TO && filter(w))
    .map(derivedSpeed)
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * September-gemiddelde van dit type. Bestaat dat niet — het normale geval voor
 * elk fase-2-type — dan het disciplinegemiddelde, geschaald naar dit type.
 */
export function baseline(state: State, person: Person, type: string): number | null {
  const t = TYPES[type];
  if (!t || t.goal == null) return null;
  const direct = septAvg(state, person, (w) => w.type === type);
  if (direct != null) return direct;
  const disc = septAvg(state, person, (w) => TYPES[w.type]?.cat === t.cat);
  if (disc == null) return null;
  return disc * (t.goal / DISC_REF[t.cat as 'run' | 'fiets' | 'zwem']);
}

/** Doeltempo voor de week waarin deze training valt. */
export function targetFor(
  state: State,
  person: Person,
  type: string,
  dateStr: string
): number | null {
  const t = TYPES[type];
  if (!t || t.goal == null) return null;
  const d = fromIso(dateStr);
  if (d < TARGET_FROM) return null;
  const b = baseline(state, person, type);
  if (b == null) return null;

  const wk = mondayOf(d);
  const f = Math.min(1, Math.max(0, (+wk - +T0) / (+T1 - +T0)));
  const better = BETTER[t.cat as 'run' | 'fiets' | 'zwem'];
  const alreadyBetter = better === 'low' ? b <= t.goal : b >= t.goal;
  // al beter dan het doel: dan nog 4% erbij over de hele periode
  if (alreadyBetter) return better === 'low' ? b * (1 - 0.04 * f) : b * (1 + 0.04 * f);
  return b + (t.goal - b) * f;
}

export type TargetClass = 'hit' | 'close' | 'miss';

export function targetClass(actual: number, target: number, type: string): TargetClass {
  const better = BETTER[TYPES[type].cat as 'run' | 'fiets' | 'zwem'];
  const ok = better === 'low' ? actual <= target : actual >= target;
  const close = better === 'low' ? actual <= target * 1.05 : actual >= target * 0.95;
  return ok ? 'hit' : close ? 'close' : 'miss';
}

/* ================= VORM & TRENDS ================= */

/** Gewogen gemiddelde over de laatste `days` dagen; recenter weegt zwaarder. */
export function recentSpeed(
  state: State,
  person: Person,
  cat: Discipline,
  days = 42
): { v: number; n: number } | null {
  const cut = addDays(new Date(), -days);
  const vals = speedsOf(doneWorkouts(state, person, cat).filter((w) => w.date >= iso(cut)));
  if (!vals.length) return null;
  let sw = 0;
  let s = 0;
  vals.forEach((x, i) => {
    const wt = i + 1;
    sw += wt;
    s += x.v * wt;
  });
  return { v: s / sw, n: vals.length };
}

/** Plat gemiddelde over een venster [from, to). */
export function windowAvg(
  state: State,
  person: Person,
  cat: Discipline,
  fromIso_: string,
  toIso_: string
): { v: number; n: number } | null {
  const vals = speedsOf(
    doneWorkouts(state, person, cat).filter((w) => w.date >= fromIso_ && w.date < toIso_)
  );
  if (!vals.length) return null;
  return { v: vals.reduce((a, b) => a + b.v, 0) / vals.length, n: vals.length };
}

/** Efficiëntie: km/u per hartslag ×100. Hoger is altijd beter. */
export function efAvg(
  state: State,
  person: Person,
  cat: Discipline,
  fromIso_: string,
  toIso_: string
): number | null {
  const vals = speedsOf(
    doneWorkouts(state, person, cat).filter((w) => w.date >= fromIso_ && w.date < toIso_)
  ).filter((x) => x.hr);
  if (!vals.length) return null;
  const toKmh = (x: SpeedPoint) =>
    cat === 'fiets' ? x.v : cat === 'run' ? 60 / x.v : 6 / x.v;
  return (vals.reduce((a, b) => a + toKmh(b) / (b.hr as number), 0) / vals.length) * 100;
}

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

/* ================= EINDTIJD ================= */

export type Estimate = {
  parts: { zwem?: number; fiets?: number; run?: number; wissels: number };
  total: number | null;
  complete: boolean;
  sw: { v: number; n: number } | null;
  bi: { v: number; n: number } | null;
  ru: { v: number; n: number } | null;
  conf: 'hoog' | 'gemiddeld' | 'laag';
};

/**
 * Racevoorspelling uit de vorm van de laatste 6 weken.
 * zwem 1900m met wetsuitvoordeel, fiets 90km met race-effect, run 21,1km met
 * vermoeidheid van het fietsen, plus 8 minuten wissels.
 */
export function estimateFinish(state: State, person: Person): Estimate {
  const sw = recentSpeed(state, person, 'zwem');
  const bi = recentSpeed(state, person, 'fiets');
  const ru = recentSpeed(state, person, 'run');

  const parts: Estimate['parts'] = { wissels: 8 };
  if (sw) parts.zwem = sw.v * 0.97 * 19;
  if (bi) parts.fiets = (90 / (bi.v * 1.03)) * 60;
  if (ru) parts.run = ru.v * 1.05 * 21.1;

  const complete = !!(sw && bi && ru);
  const total = complete
    ? (parts.zwem as number) + (parts.fiets as number) + (parts.run as number) + parts.wissels
    : null;
  const nMin = complete ? Math.min(sw!.n, bi!.n, ru!.n) : 0;

  return {
    parts,
    total,
    complete,
    sw,
    bi,
    ru,
    conf: nMin >= 6 ? 'hoog' : nMin >= 3 ? 'gemiddeld' : 'laag'
  };
}

/** Discipline met de grootste relatieve achterstand op zijn racedoel. */
export function biggestGap(est: Estimate): string | null {
  if (!est.complete) return null;
  const gaps: [string, number][] = [
    ['lopen', (est.ru!.v - DISC_REF.run) / DISC_REF.run],
    ['fietsen', (DISC_REF.fiets - est.bi!.v) / DISC_REF.fiets],
    ['zwemmen', (est.sw!.v - DISC_REF.zwem) / DISC_REF.zwem]
  ];
  const worst = gaps.filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  return worst.length ? worst[0][0] : null;
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
      .filter((w) => w.date >= weekKey && w.date < end)
      .reduce((a, w) => a + (w.stats?.tijdMin || 0), 0) / 60
  );
}

/** Trainingsload: Σ (tijd × RPE), RPE valt terug op 5. */
export function weekLoad(state: State, person: Person, weekKey: string): number {
  const end = iso(addDays(fromIso(weekKey), 7));
  return doneWorkouts(state, person)
    .filter((w) => w.date >= weekKey && w.date < end)
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

/* ================= SAMENVATTING ================= */

/** De geschreven analyse onderaan het dashboard (sectie 7). */
export function summaryText(
  state: State,
  person: Person,
  naam: string,
  est: Estimate,
  consPct: number | null,
  lastVolume: number
): string {
  const n = doneWorkouts(state, person).length;
  if (!n) {
    return 'Nog geen afgeronde trainingen. Zodra je trainingen afvinkt met tijd en afstand begint hier de analyse: vorm per discipline, trends, en een steeds nauwkeurigere eindtijdvoorspelling.';
  }

  const bits: string[] = [
    `${naam} heeft <b>${n} ${n === 1 ? 'training' : 'trainingen'}</b> afgerond.`
  ];

  if (consPct != null) {
    bits.push(
      consPct >= 85
        ? `Consistentie is ${consPct}% — sterk, dit is de belangrijkste voorspeller van je eindtijd.`
        : consPct >= 65
          ? `Consistentie is ${consPct}% — kan strakker; elke gemiste sessie kost meer dan een langzame sessie.`
          : `Consistentie is ${consPct}% — hier zit je grootste probleem, niet in je tempo.`
    );
  }

  if (est.complete) {
    const total = est.total as number;
    bits.push(
      `Op huidige vorm kom je uit rond <b>${fmtHM(total)}</b>. ` +
        (total <= GOAL_MIN
          ? 'Dat is onder de 5 uur — de opdracht is nu vasthouden en niet blesseren.'
          : `Voor sub-5 moet er nog ${fmtHM(total - GOAL_MIN)} af; de weektargets in de agenda zijn daarop berekend.`)
    );
  } else {
    bits.push(
      'Voor een eindtijdschatting mis ik nog recente afgeronde trainingen in minstens één discipline.'
    );
  }

  if (lastVolume > 0 && lastVolume < 4) {
    bits.push(
      `Weekvolume (${fmtDec(lastVolume)}u) is aan de lage kant voor een 70.3 — bouw richting 7–9u per week.`
    );
  }
  if (lastVolume >= 9) {
    bits.push(`Let op: ${fmtDec(lastVolume)}u in één week is fors. Herstel is ook training.`);
  }

  return bits.join(' ');
}
