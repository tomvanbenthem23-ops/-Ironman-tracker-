import { PHASE2_FROM, TYPES } from './config';
import { fromIso, kindOf, mondayOf, iso, uid } from './calc';
import type { Block, Discipline, GarminRec, Kind, Person, Stats, Wind, Workout } from './types';

/**
 * Omzetting van intervals.icu-data naar de tracker. Puur: geen fetch, geen
 * database — zodat het met vaste voorbeelddata te testen is.
 *
 * Eenheden van intervals.icu (metrisch): afstand in meters, tijd in seconden,
 * snelheid in m/s. Hartslagzones zijn bovengrenzen per zone in bpm.
 */

export type IcuActivity = {
  id: string;
  start_date_local: string;
  type: string;
  name?: string;
  source?: string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  total_elevation_gain?: number | null;
  average_speed?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  icu_average_watts?: number | null;
  device_watts?: boolean | null;
  trainer?: boolean | null;
  /** Schatting van je FTP door intervals.icu, uit je vermogensdata tot en met deze rit. */
  icu_rolling_ftp?: number | null;
  icu_rpe?: number | null;
  perceived_exertion?: number | null;
  average_wind_speed?: number | null;
  prevailing_wind_deg?: number | null;
  headwind_percent?: number | null;
  tailwind_percent?: number | null;
};

export type IcuInterval = {
  type: 'WORK' | 'RECOVERY' | string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  average_speed?: number | null;
  average_heartrate?: number | null;
  average_watts?: number | null;
};

export type IcuWellness = {
  id: string; // datum, YYYY-MM-DD
  vo2max?: number | null;
  restingHR?: number | null;
  weight?: number | null;
};

export type IcuSportSettings = {
  types?: string[];
  hr_zones?: number[] | null;
  lthr?: number | null;
  max_hr?: number | null;
  ftp?: number | null;
};

/* ================= discipline & eenheden ================= */

const RUN = ['Run', 'TrailRun', 'VirtualRun', 'Treadmill'];
const RIDE = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'Velomobile'];
const SWIM = ['Swim', 'OpenWaterSwim'];

/**
 * Discipline van een activiteit. Kracht nemen jullie niet op met het horloge,
 * dus alles wat geen run/fiets/zwem is wordt overgeslagen.
 */
export function disciplineOf(type: string): Discipline | null {
  if (RUN.includes(type)) return 'run';
  if (RIDE.includes(type)) return 'fiets';
  if (SWIM.includes(type)) return 'zwem';
  return null;
}

/** m/s → de eenheid van de tracker: run min/km, zwem min/100m, fiets km/u. */
export function speedToUnit(ms: number | null | undefined, cat: Discipline): number | null {
  if (!ms || ms <= 0) return null;
  if (cat === 'run') return 1000 / ms / 60;
  if (cat === 'zwem') return 100 / ms / 60;
  if (cat === 'fiets') return ms * 3.6;
  return null;
}

/** Ondergrens in km/u van Beaufort 1 t/m 12. */
const BFT_FROM = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];

/** km/u → Beaufort. */
export function kmhToBft(kmh: number): number {
  let b = 0;
  BFT_FROM.forEach((from, i) => {
    if (kmh >= from) b = i + 1;
  });
  return b;
}

/* ================= intervallen → structuur ================= */

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const similar = (a: number, b: number, tol: number) =>
  Math.abs(a - b) <= tol * Math.max(a, b);

/** Maximaal aantal blokken per training: daarboven wordt het onoverzichtelijk. */
const MAX_BLOCKS = 2;

/**
 * Werkintervallen → blokken, alleen voor échte intervaltrainingen.
 *
 * Een horloge maakt elke km (fiets: 5 km) een auto-lap, en intervals.icu geeft
 * die als werkintervallen door — een gewone duurloop lijkt dan op 16 × 1000 m.
 * Daarom telt een werkinterval alleen als herhaling als er een rustinterval
 * direct voor of na zit: echte herhalingen hebben rust, auto-laps niet.
 *
 * Opeenvolgende herhalingen van vergelijkbare lengte (±12% tijd of ±6%
 * afstand) vormen één blok. Losse herhalingen vallen weg, en alleen de
 * grootste twee blokken (in werktijd) blijven over. Of een blok in afstand of
 * tijd staat hangt af van wat het rondst is: baanherhalingen hebben ronde
 * afstanden (800 m), drempelblokken op de weg ronde tijden (20 min).
 */
export function intervalsToStructure(
  intervals: IcuInterval[],
  cat: Discipline,
  _totalMovingS?: number | null,
  /** Hoe ver herhalingen in één blok mogen verschillen; ruimer voor herhalingen uit het tempoverloop. */
  tolerance = 0.12
): Block[] | null {
  const minRest = cat === 'zwem' ? 8 : 20;
  const isRest = (i: IcuInterval | undefined, work: IcuInterval) => {
    if (!i || i.type !== 'RECOVERY') return false;
    if ((i.elapsed_time ?? i.moving_time ?? 0) < minRest) return false;
    // rust moet ook echt rustiger zijn dan het werk (bij zwemmen: stilstaan aan de kant)
    if (i.average_speed && work.average_speed) return i.average_speed < work.average_speed * 0.9;
    return true;
  };

  // groeperen: herhalingen met rust, aaneengesloten door alleen rustintervallen
  const groups: IcuInterval[][] = [];
  let current: IcuInterval[] | null = null;
  intervals.forEach((iv, idx) => {
    if (iv.type !== 'WORK' || !(iv.moving_time ?? 0)) {
      if (iv.type !== 'RECOVERY') current = null;
      return;
    }
    const real = isRest(intervals[idx - 1], iv) || isRest(intervals[idx + 1], iv);
    if (!real) {
      current = null;
      return;
    }
    const ref = current?.[0];
    const same =
      ref &&
      (similar(ref.moving_time ?? 0, iv.moving_time ?? 0, tolerance) ||
        (!!ref.distance && !!iv.distance && similar(ref.distance, iv.distance, tolerance / 2)));
    if (current && same) current.push(iv);
    else groups.push((current = [iv]));
  });

  const kept = groups
    .filter((g) => g.length >= 2 && (cat !== 'zwem' || median(g.map((i) => i.distance ?? 0)) >= 50))
    .map((g, order) => ({ g, order, work: g.reduce((s, i) => s + (i.moving_time ?? 0), 0) }))
    .sort((a, b) => b.work - a.work)
    .slice(0, MAX_BLOCKS)
    .sort((a, b) => a.order - b.order)
    .map((x) => x.g);
  if (!kept.length) return null;

  // rust = mediane herstelduur tussen de werkblokken
  const rests = intervals
    .filter((i) => i.type === 'RECOVERY')
    .map((i) => i.elapsed_time ?? i.moving_time ?? 0)
    .filter((s) => s >= minRest);
  const restDurS = rests.length ? Math.round(median(rests)) : null;

  return kept.map((g) => {
    const dists = g.map((i) => i.distance ?? 0);
    const durs = g.map((i) => i.moving_time ?? 0);
    const md = median(dists);
    const mt = median(durs);
    const distOff = md > 0 ? Math.abs(md - roundDist(md, cat)) / md : Infinity;
    const durOff = mt > 0 ? Math.abs(mt - roundDur(mt)) / mt : Infinity;
    const b: Block = { reps: g.length };
    if (distOff <= durOff) b.workDistM = roundDist(md, cat);
    else b.workDurS = roundDur(mt);
    b.actual = g.map((i) => round3(speedToUnit(i.average_speed, cat)));
    b.actualHr = g.map((i) => (i.average_heartrate ? Math.round(i.average_heartrate) : null));
    if (cat === 'fiets' && g.some((i) => i.average_watts)) {
      b.watts = Math.round(median(g.map((i) => i.average_watts ?? 0).filter(Boolean)));
    }
    if (restDurS && g.length > 1) b.restDurS = restDurS;
    return b;
  });
}

/* ================= tempoverloop → intervallen ================= */

/** Meetreeksen per seconde (of per meetpunt) van één activiteit. */
export type IcuStreams = {
  time: number[];
  distance: number[];
  heartrate?: (number | null)[] | null;
};

/**
 * Herhalingen uit het tempoverloop, voor runs waar het horloge alleen
 * auto-laps per km maakte: de ronden lopen dan dwars door de blokken heen en
 * er is geen rustinterval om ze aan te herkennen.
 *
 * Werkwijze: tempo per meetpunt over 20 s gladgestreken; stilstaan telt niet
 * mee. De grens tussen hard en rustig volgt uit de verdeling (Otsu: de
 * splitsing met het grootste verschil tussen beide groepen). Stukken hard
 * van minstens 60 s zijn herhalingen; een korte onderbreking (≤ 30 s,
 * stoplicht, tot 45 s als je stilstond) hoort bij de herhaling.
 *
 * Alleen als het er echt op lijkt, anders null:
 * - hard is minstens 25% sneller dan rustig (heuvels en een wisselend
 *   duurlooptempo blijven daaronder);
 * - de herhalingen beslaan 10–80% van de tijd;
 * - de hartslag ligt in de herhalingen hoger dan in de rust (bij heuvels is
 *   dat andersom);
 * - minstens twee herhalingen; een stuk dat flink trager is dan de rest
 *   (het eind van de warming-up) valt af.
 * Vóór de eerste herhaling is warming-up, na de laatste cooling-down.
 */
export function streamsToIntervals(s: IcuStreams, cat: Discipline): IcuInterval[] | null {
  if (cat !== 'run') return null; // fietssnelheid zegt te weinig (wind, heuvels)
  const t = s.time;
  const d = s.distance;
  const hr = s.heartrate ?? null;
  const n = Math.min(t?.length ?? 0, d?.length ?? 0);
  if (n < 300) return null;

  // gladgestreken snelheid (m/s) over ±10 s
  const sp: number[] = new Array(n);
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    while (t[a] < t[i] - 10) a++;
    if (b < i) b = i;
    while (b + 1 < n && t[b + 1] <= t[i] + 10) b++;
    sp[i] = t[b] > t[a] ? (d[b] - d[a]) / (t[b] - t[a]) : 0;
  }
  const moving = sp.map((v) => v > 1.0); // langzamer dan 16:40 /km = stilstaan
  const mv = sp.filter((_, i) => moving[i]);
  if (mv.length < 300) return null;

  const T = otsu(mv);
  if (T == null) return null;
  const fastMed = median(mv.filter((v) => v >= T));
  const slowMed = median(mv.filter((v) => v < T));
  if (!(slowMed > 0) || fastMed / slowMed < 1.25) return null;

  type Seg = { fast: boolean; a: number; b: number };
  let segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const fast = moving[i] && sp[i] >= T;
    const last = segs[segs.length - 1];
    if (last && last.fast === fast) last.b = i;
    else segs.push({ fast, a: i, b: i });
  }
  const dur = (g: Seg) => t[g.b] - t[g.a] + 1;
  const merge = () => {
    const out: Seg[] = [];
    for (const g of segs) {
      const last = out[out.length - 1];
      if (last && last.fast === g.fast) last.b = g.b;
      else out.push({ ...g });
    }
    segs = out;
  };
  const speedOf = (g: Seg) => (d[g.b] - d[g.a]) / dur(g);

  // korte onderbreking binnen een herhaling hoort erbij: tot 30 s, of tot 45 s
  // als je stilstond (stoplicht; door het gladstrijken lijkt 20 s stilstaan ±30 s)
  const stood = (g: Seg) => moving.slice(g.a, g.b + 1).includes(false);
  segs.forEach((g, i) => {
    if (!g.fast && i > 0 && i < segs.length - 1 && (dur(g) <= 30 || (dur(g) <= 45 && stood(g)))) g.fast = true;
  });
  merge();
  // te kort voor een herhaling (bv. een versnelling van 20 s)
  segs.forEach((g) => {
    if (g.fast && dur(g) < 60) g.fast = false;
  });
  merge();
  // flink trager dan de andere herhalingen: eind van de warming-up, geen herhaling
  const repSpeed = median(segs.filter((g) => g.fast).map(speedOf));
  segs.forEach((g) => {
    if (g.fast && speedOf(g) < 0.9 * repSpeed) g.fast = false;
  });
  merge();

  const work = segs.filter((g) => g.fast);
  if (work.length < 2) return null;
  const cover = work.reduce((x, g) => x + dur(g), 0) / mv.length;
  if (cover < 0.1 || cover > 0.8) return null;

  const avgHr = (gs: Seg[]) => {
    let sum = 0;
    let c = 0;
    for (const g of gs) for (let i = g.a; i <= g.b; i++) if (hr?.[i]) (sum += hr[i]!), c++;
    return c ? sum / c : null;
  };
  const rest = segs.filter((g, i) => !g.fast && i > 0 && i < segs.length - 1);
  const workHr = avgHr(work);
  const restHr = avgHr(rest);
  if (workHr != null && restHr != null && workHr < restHr + 2) return null;

  return segs.map((g, i) => {
    const s = dur(g);
    const dist = Math.max(0, d[g.b] - d[g.a]);
    const h = avgHr([g]);
    return {
      type: g.fast ? 'WORK' : i === 0 ? 'WARMUP' : i === segs.length - 1 ? 'COOLDOWN' : 'RECOVERY',
      distance: dist,
      moving_time: s,
      elapsed_time: s,
      average_speed: dist / s,
      average_heartrate: h
    };
  });
}

/** Otsu-drempel: de splitsing van de waarden met het grootste verschil tussen beide groepen. */
function otsu(xs: number[], bins = 64): number | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (!(hi > lo)) return null;
  const h = new Array(bins).fill(0);
  for (const x of xs) h[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))]++;
  const total = xs.length;
  const sumAll = h.reduce((s, c, i) => s + c * i, 0);
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let cut = 0;
  for (let i = 0; i < bins; i++) {
    wB += h[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += h[i] * i;
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      cut = i;
    }
  }
  return lo + ((cut + 1) * (hi - lo)) / bins;
}

/** Ronde afstanden: 798 m → 800 m, 1004 m → 1000 m; zwemmen op 25 m. */
function roundDist(m: number, cat: Discipline) {
  const step = cat === 'zwem' ? 25 : m >= 3000 ? 500 : 100;
  return Math.round(m / step) * step;
}

/** Ronde tijden: 1197 s → 20 min, 92 s → 1:30. */
function roundDur(s: number) {
  if (s >= 300) return Math.round(s / 60) * 60;
  return Math.round(s / 15) * 15;
}

const round3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);

/* ================= soort ================= */

/** Soort sessie afgeleid uit wat er gedaan is. */
export function inferKind(
  act: IcuActivity,
  cat: Discipline,
  structure: Block[] | null
): Kind {
  const reps = structure?.reduce((a, b) => a + b.reps, 0) ?? 0;
  const workMin = structure?.length
    ? median(
        structure.flatMap((b) =>
          Array(b.reps).fill(
            b.workDurS ? b.workDurS / 60 : (b.workDistM ?? 0) / 1000 / ((act.average_speed ?? 3) * 0.06)
          )
        )
      )
    : 0;

  if (cat === 'run') {
    if (reps >= 2) return workMin >= 8 ? 'threshold' : 'interval';
    const km = (act.distance ?? 0) / 1000;
    const min = (act.moving_time ?? 0) / 60;
    return km >= 12 || min >= 70 ? 'long' : 'easy';
  }
  if (cat === 'fiets') {
    if (reps >= 2) return workMin >= 8 ? 'tempo' : 'interval';
    return 'endurance';
  }
  if (cat === 'zwem') return reps >= 2 ? 'sets' : 'continuous';
  return 'strength';
}

/** Welk palettype een nieuwe, niet-geplande sessie krijgt. */
export function paletteTypeFor(cat: Discipline, kind: Kind, date: string, movingMin: number): string {
  const phase2 = fromIso(date) >= PHASE2_FROM;
  if (cat === 'run') {
    if (!phase2) return kind === 'long' ? 'lange_run' : 'korte_run';
    return kind === 'long' ? 'long_run' : kind === 'easy' ? 'easy_run' : 'interval_run';
  }
  if (cat === 'fiets') {
    if (!phase2) return kind === 'endurance' && movingMin >= 80 ? 'lange_fiets' : 'korte_fiets';
    if (kind !== 'endurance') return 'bike60';
    return movingMin >= 135 ? 'bike150' : movingMin >= 75 ? 'bike90' : 'bike60';
  }
  if (cat === 'zwem') return phase2 ? (kind === 'sets' ? 'swim_int' : 'swim2000') : 'zwem';
  return phase2 ? 'full_body' : 'core';
}

/* ================= activiteit → velden ================= */

export function activityStats(act: IcuActivity, cat: Discipline): Stats {
  const dist = act.distance ?? null;
  return {
    done: true,
    tijdMin: act.moving_time ? act.moving_time / 60 : null,
    gemHr: act.average_heartrate ? Math.round(act.average_heartrate) : null,
    maxHr: act.max_heartrate ? Math.round(act.max_heartrate) : null,
    afstand: dist == null ? null : cat === 'zwem' ? Math.round(dist) : Math.round(dist) / 1000,
    // de tracker leidt de snelheid zelf af uit tijd + afstand
    snelheid: null,
    hoogte:
      cat !== 'zwem' && act.total_elevation_gain != null
        ? Math.round(act.total_elevation_gain)
        : null,
    vermogen:
      cat === 'fiets' && act.device_watts && act.icu_average_watts
        ? Math.round(act.icu_average_watts)
        : null,
    rpe: act.icu_rpe ?? (act.perceived_exertion ? Math.round(act.perceived_exertion) : null)
  };
}

/**
 * Wind voor buitenritten. intervals.icu rekent zelf uit welk deel van de rit
 * tegen- en meewind was; dat is km tegen = afstand × percentage.
 * Windsnelheid komt in m/s.
 */
export function activityWind(act: IcuActivity): Wind | null {
  if (act.trainer) return null;
  if (act.headwind_percent == null && act.average_wind_speed == null) return null;
  const km = (act.distance ?? 0) / 1000;
  const head = act.headwind_percent ?? null;
  const tail = act.tailwind_percent ?? null;
  const speedKmh = act.average_wind_speed != null ? act.average_wind_speed * 3.6 : null;
  return {
    source: 'auto', // intervals.icu haalt het weer bij de rit zelf op
    speedKmh: speedKmh != null ? Math.round(speedKmh) : null,
    bft: speedKmh != null ? kmhToBft(speedKmh) : null,
    fromDeg: act.prevailing_wind_deg ?? null,
    headKm: head != null ? Math.round((km * head) / 10) / 10 : null,
    tailKm: tail != null ? Math.round((km * tail) / 10) / 10 : null,
    crossKm:
      head != null && tail != null ? Math.round((km * (100 - head - tail)) / 10) / 10 : null,
    headwindKmh: null
  };
}

/** Rit binnen: op de trainer (of in Zwift e.d.). Daar is geen wind en zegt snelheid niets. */
export const isIndoorRide = (act: IcuActivity) =>
  !!act.trainer || act.type === 'VirtualRide';

/**
 * FTP-schatting uit je eigen vermogensdata: de nieuwste rit met een echte
 * wattmeter (bv. de hometrainer) waarvoor intervals.icu een rollende FTP
 * berekende. Dat is iets anders dan de FTP in de instellingen van een nieuw
 * account (standaard 250): die gebruiken we niet.
 */
export function estimatedFtp(acts: IcuActivity[]): number | null {
  const withPower = acts
    .filter((a) => disciplineOf(a.type) === 'fiets' && a.device_watts && (a.icu_rolling_ftp ?? 0) > 0)
    .sort((a, b) => (a.start_date_local < b.start_date_local ? 1 : -1));
  return withPower.length ? Math.round(withPower[0].icu_rolling_ftp!) : null;
}

/* ================= koppelen aan de planning ================= */

/** Gelijkmatige trainingen: daar hoort geen opbouw bij, hoe veel rondes het horloge ook maakte. */
const STEADY: Kind[] = ['long', 'easy', 'endurance', 'continuous'];

export type SyncResult = {
  upserts: Workout[];
  created: number;
  matched: number;
  updated: number;
};

/**
 * Bepaalt per activiteit welke training ermee gevuld wordt:
 * 1. dezelfde activiteit eerder gesynct (external_id) → bijwerken;
 * 2. anders een training van dezelfde persoon, dag en discipline zonder
 *    Garmin-koppeling — gepland of al met de hand ingevuld — met voorkeur
 *    voor een passende soort;
 * 3. anders een nieuwe training.
 * Gekozen soort en type van een geplande training blijven staan: jullie plan
 * is leidend, de Garmin-data vult in wat er gebeurd is.
 */
export function matchActivities(
  person: Person,
  existing: Workout[],
  items: { act: IcuActivity; intervals: IcuInterval[] | null; streams?: IcuStreams | null }[]
): SyncResult {
  const mine = existing.filter((w) => w.person === person);
  const byExt = new Map(mine.filter((w) => w.externalId).map((w) => [w.externalId!, w]));
  const claimed = new Set<string>();
  const out: SyncResult = { upserts: [], created: 0, matched: 0, updated: 0 };

  // oudste eerst, zodat twee runs op één dag in volgorde gekoppeld worden
  const sorted = [...items].sort((a, b) =>
    a.act.start_date_local < b.act.start_date_local ? -1 : 1
  );

  for (const { act, intervals, streams } of sorted) {
    if (act.source === 'STRAVA') continue; // lege stub, niet bruikbaar
    const cat = disciplineOf(act.type);
    if (!cat) continue;

    const date = act.start_date_local.slice(0, 10);
    // eerst de ronden; leveren die niets op (alleen auto-laps), dan het tempoverloop
    const fromStream = streams ? streamsToIntervals(streams, cat) : null;
    const structure =
      (intervals ? intervalsToStructure(intervals, cat, act.moving_time) : null) ??
      (fromStream ? intervalsToStructure(fromStream, cat, act.moving_time, 0.25) : null);
    const fresh = !!intervals || !!streams;
    const kind = inferKind(act, cat, structure);
    const stats = activityStats(act, cat);
    const wind = cat === 'fiets' ? activityWind(act) : null;
    const autoIndoor = cat === 'fiets' ? isIndoorRide(act) : null;
    const extId = String(act.id);

    const prior = byExt.get(extId);
    if (prior) {
      claimed.add(prior.id);
      const k = prior.kind ?? kind;
      out.upserts.push({
        ...prior,
        stats: { ...stats, rpe: prior.stats.rpe ?? stats.rpe },
        kind: k,
        // zonder verse intervallen (gewone sync) blijft de opbouw staan
        structure: STEADY.includes(k)
          ? null
          : fresh
            ? structure
            : (prior.structure ?? null),
        // zelf omgezet (binnen/buiten) gaat voor wat Garmin zegt
        indoor: prior.indoor ?? autoIndoor,
        wind: (prior.indoor ?? autoIndoor) ? null : (wind ?? prior.wind ?? null),
        source: 'icu',
        externalId: extId
      });
      out.updated++;
      continue;
    }

    const candidates = mine.filter(
      (w) =>
        w.date === date &&
        !w.externalId &&
        !claimed.has(w.id) &&
        TYPES[w.type]?.cat === cat
    );
    const target =
      candidates.find((w) => kindOf(w) === kind && !w.stats?.done) ??
      candidates.find((w) => !w.stats?.done) ??
      candidates.find((w) => kindOf(w) === kind) ??
      candidates[0];

    if (target) {
      claimed.add(target.id);
      out.upserts.push({
        ...target,
        // RPE is jullie eigen gevoel: een handmatige waarde blijft staan
        stats: { ...stats, rpe: target.stats?.rpe ?? stats.rpe },
        kind: target.kind ?? null,
        structure: STEADY.includes(kindOf(target)) ? null : (structure ?? target.structure ?? null),
        indoor: target.indoor ?? autoIndoor,
        wind: (target.indoor ?? autoIndoor) ? null : (wind ?? target.wind ?? null),
        source: 'icu',
        externalId: extId
      });
      out.matched++;
      continue;
    }

    out.upserts.push({
      id: 'icu' + uid(),
      person,
      type: paletteTypeFor(cat, kind, date, (act.moving_time ?? 0) / 60),
      date,
      stats,
      kind,
      structure: STEADY.includes(kind) ? null : structure,
      wind: autoIndoor ? null : wind,
      indoor: autoIndoor,
      source: 'icu',
      externalId: extId
    });
    out.created++;
  }

  return out;
}

/* ================= wellness & zones ================= */

/**
 * Wellness per dag → één record per week (laatste niet-lege waarde per veld).
 * Bestaande waarden worden niet met leeg overschreven.
 */
export function wellnessToWeeks(
  records: IcuWellness[],
  current: Record<string, GarminRec>
): Record<string, GarminRec> {
  const out: Record<string, GarminRec> = {};
  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of sorted) {
    const wk = iso(mondayOf(r.id));
    const rec = (out[wk] ??= { ...(current[wk] ?? {}) });
    if (r.vo2max != null) rec.vo2 = Math.round(r.vo2max * 10) / 10;
    if (r.restingHR != null) rec.rhr = Math.round(r.restingHR);
    if (r.weight != null) rec.gewicht = Math.round(r.weight * 10) / 10;
  }
  // weken waar niets nieuws in kwam niet terugschrijven
  for (const wk of Object.keys(out)) {
    const a = out[wk];
    const b = current[wk] ?? {};
    if (a.vo2 == b.vo2 && a.rhr == b.rhr && a.gewicht == b.gewicht) delete out[wk];
  }
  return out;
}

/**
 * Zone 2 uit de hardloopzones van intervals.icu. `hr_zones` zijn bovengrenzen:
 * zone 1 loopt t/m zones[0], zone 2 van zones[0]+1 t/m zones[1].
 *
 * Een nieuw intervals.icu-account staat op standaardwaarden (max 220, omslag
 * 200, FTP 250) die niets met de sporter te maken hebben. Die herkennen we en
 * nemen we niet over:
 * - hartslag: alleen als max-HR geloofwaardig is tegenover de hoogste hartslag
 *   die je werkelijk haalde (hooguit 25 erboven) en het omslagpunt eronder ligt;
 * - FTP: nooit uit de instellingen; die komt uit je ritten (estimatedFtp).
 */
export function zonesFromSettings(
  list: IcuSportSettings[],
  observedMaxHr: number | null = null
) {
  const run = list.find((s) => s.types?.includes('Run'));
  const ride = list.find((s) => s.types?.includes('Ride'));
  const z = run?.hr_zones;
  const max = run?.max_hr ?? null;
  const lthr = run?.lthr ?? null;
  const hrValid =
    !!max &&
    !!lthr &&
    lthr < max &&
    lthr >= max * 0.75 &&
    (observedMaxHr == null || max <= observedMaxHr + 25);
  const zonesValid = hrValid && !!z && z.length >= 2 && z[1] < lthr!;
  return {
    hrValid,
    z2Low: zonesValid ? z![0] + 1 : null,
    z2High: zonesValid ? z![1] : null,
    lthr: hrValid ? lthr : null,
    maxHr: hrValid ? max : null,
    // de FTP uit de instellingen is bij een nieuw account een standaardwaarde; de echte
    // schatting komt uit je ritten (estimatedFtp)
    ftp: null as number | null,
    /** De ruwe waarden, om eerder overgenomen standaardwaarden te kunnen opruimen. */
    raw: { maxHr: max, lthr, ftp: ride?.ftp ?? null }
  };
}
