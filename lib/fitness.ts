import { BFT_KMH, MONTH_NAMES } from './config';
import {
  addDays,
  blockActualAvg,
  catOf,
  derivedSpeed,
  fmtDur,
  fmtPace,
  fromIso,
  iso,
  kindOf,
  robustMax
} from './calc';
import type { Person, State, Workout } from './types';

/**
 * Fitheidsankers per persoon. Elk anker komt alleen uit trainingen die er iets
 * over zeggen, en onthoudt welke dat waren — zodat de UI kan laten zien waar
 * een voorschrift of eindtijd op rust.
 *
 * Alles wordt berekend uit trainingen van vóór een peildatum. Daardoor ligt het
 * voorschrift van een training in het verleden vast, terwijl toekomstige
 * trainingen meebewegen met je fitheid.
 */

export type Confidence = 'hoog' | 'gemiddeld' | 'laag';

export type Anchor = {
  /** Waarde in de eenheid van de discipline (min/km, min/100m, km/u, W). */
  value: number;
  n: number;
  /** Datum van de jongste training waar het anker op rust. */
  latest: string;
  basis: string[];
  confidence: Confidence;
};

export type Anchors = {
  z2: { low: number | null; high: number | null; source: string | null };
  /** Drempeltempo hardlopen, min/km (≈ wat je een uur vol kunt houden). */
  runThreshold: Anchor | null;
  /** Tempo in zone 2, min/km. */
  runZ2: Anchor | null;
  /** Langste recente long run, km (mediaan van de laatste drie). */
  longRunKm: Anchor | null;
  /** Duursnelheid op de fiets, km/u, gecorrigeerd voor wind. */
  bikeEndurance: Anchor | null;
  bikeEnduranceMin: Anchor | null;
  ftp: Anchor | null;
  /** Critical swim speed, min/100m. */
  css: Anchor | null;
};

/** Riegel: tempo schaalt met (duur-verhouding)^0,06. */
const RIEGEL = 0.06;

const day = (d: string) => {
  const x = fromIso(d);
  return `${x.getDate()} ${MONTH_NAMES[x.getMonth()].slice(0, 3)}`;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const confidenceOf = (n: number, ageDays: number): Confidence =>
  n >= 3 && ageDays <= 21 ? 'hoog' : n >= 2 && ageDays <= 35 ? 'gemiddeld' : 'laag';

const ageOf = (latest: string, asOf: string) =>
  Math.round((+fromIso(asOf) - +fromIso(latest)) / 86400000);

/** Afgeronde trainingen van één persoon binnen [asOf − days, asOf). */
function window(state: State, person: Person, asOf: string, days: number): Workout[] {
  const from = iso(addDays(fromIso(asOf), -days));
  return Object.values(state.workouts)
    .filter((w) => w.person === person && w.stats?.done && w.date >= from && w.date < asOf)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Gewogen gemiddelde, recentere waarden zwaarder (1, 2, 3, …). */
function recencyAvg(xs: number[]) {
  let s = 0;
  let sw = 0;
  xs.forEach((x, i) => {
    s += x * (i + 1);
    sw += i + 1;
  });
  return s / sw;
}

/* ================= zone 2 ================= */

export function zone2(state: State, person: Person) {
  const s = state.settings[person] ?? {};
  if (s.z2High) return { low: s.z2Low ?? null, high: s.z2High, source: s.z2Source ?? null };
  if (s.maxHr) {
    return {
      low: Math.round(s.maxHr * 0.6),
      high: Math.round(s.maxHr * 0.7),
      source: 'max-HR'
    };
  }
  return { low: null, high: null, source: null };
}

/* ================= hardlopen ================= */

/**
 * Drempeltempo. Eerst uit gestructureerde kwaliteitsblokken (threshold,
 * interval): het gemiddelde tempo van de herhalingen, omgerekend naar een uur
 * via Riegel op de totale werktijd — 2 × 20 min telt als 40 min, 6 × 800 m als
 * ±19 min. Zonder blokken: de snelste uur-equivalente prestatie uit runs van
 * minstens 20 minuten. Easy runs zijn nooit de snelste, dus die tellen
 * vanzelf niet mee.
 */
export function runThreshold(state: State, person: Person, asOf: string): Anchor | null {
  const runs = window(state, person, asOf, 56).filter((w) => catOf(w) === 'run');

  const fromBlocks: { v: number; d: string; label: string }[] = [];
  for (const w of runs) {
    for (const b of w.structure ?? []) {
      const pace = blockActualAvg(b);
      const repMin = b.workDurS ? b.workDurS / 60 : b.workDistM && pace ? (b.workDistM / 1000) * pace : 0;
      if (!pace || !repMin || repMin < 2) continue;
      const workMin = repMin * (b.actual?.filter((x) => x != null).length || b.reps);
      fromBlocks.push({
        v: pace * Math.pow(60 / workMin, RIEGEL),
        d: w.date,
        label: `${b.reps}×${b.workDurS ? fmtDur(b.workDurS) : `${b.workDistM} m`} op ${day(w.date)}`
      });
    }
  }
  if (fromBlocks.length) {
    const recent = fromBlocks.slice(-4);
    const latest = recent[recent.length - 1].d;
    return {
      value: recencyAvg(recent.map((x) => x.v)),
      n: recent.length,
      latest,
      basis: recent.map((x) => x.label),
      confidence: confidenceOf(recent.length, ageOf(latest, asOf))
    };
  }

  // zonder harde blokken: uit tempo + hartslag, doorgetrokken naar het omslagpunt
  const fromHr = runThresholdFromHr(state, person, asOf);
  if (fromHr) return fromHr;

  const efforts = runs
    .map((w) => {
      const p = derivedSpeed(w);
      const min = w.stats?.tijdMin ?? 0;
      return p && min >= 20
        ? { v: p * Math.pow(60 / min, RIEGEL), d: w.date, km: w.stats?.afstand ?? 0 }
        : null;
    })
    .filter((x): x is { v: number; d: string; km: number } => !!x)
    .filter((x) => x.d >= iso(addDays(fromIso(asOf), -42)));
  if (!efforts.length) return null;
  const best = efforts.reduce((a, b) => (b.v < a.v ? b : a));
  return {
    value: best.v,
    n: 1,
    latest: best.d,
    basis: [`snelste run (${best.km.toFixed(1).replace('.', ',')} km op ${day(best.d)}), omgerekend`],
    // één doorgaande run zegt minder dan echte drempelblokken
    confidence: 'laag'
  };
}

/**
 * Hoogste hartslag die je echt haalt: ingesteld, anders de middelste van je
 * drie hoogste run-pieken van de laatste 90 dagen (één sensorpiek telt niet).
 */
export function maxHrOf(state: State, person: Person, asOf: string): number | null {
  const s = state.settings[person] ?? {};
  if (s.maxHr) return s.maxHr;
  return robustMax(
    window(state, person, asOf, 90)
      .filter((w) => catOf(w) === 'run' && w.stats?.maxHr)
      .map((w) => w.stats.maxHr!)
  );
}

/**
 * Hartslag op het omslagpunt (LTHR): uit de instellingen als die
 * geloofwaardig is (onder de max), anders 90% van de max-HR. 90% is aan de
 * voorzichtige kant: een te hoog omslagpunt maakt je drempeltempo te snel.
 */
export function thresholdHr(state: State, person: Person, asOf: string): number | null {
  const s = state.settings[person] ?? {};
  const max = maxHrOf(state, person, asOf);
  if (s.lthr && (!max || s.lthr < max)) return s.lthr;
  return max ? Math.round(max * 0.9) : null;
}

/** Rusthartslag: laatste Garmin-waarde, anders 55. */
export function restingHr(state: State, person: Person): number {
  const weeks = Object.entries(state.garmin[person] ?? {})
    .filter(([, r]) => r.rhr)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return weeks.length ? weeks[weeks.length - 1][1].rhr! : 55;
}

/**
 * Drempeltempo uit gewone runs: snelheid schaalt grofweg lineair met de
 * hartslagreserve. Een run op 5:20 /km bij HR 154 met rust 55 en omslag 167
 * zegt: op het omslagpunt ±13% sneller, dus ±4:43 /km.
 *
 * Hoe verder je moet doortrekken, hoe onzekerder. Daarom:
 * - alleen runs van 20+ minuten met minstens halve inspanning (hartslagreserve);
 * - hooguit 25% sneller doortrekken;
 * - gewogen gemiddelde waarin runs dicht bij het omslagpunt het zwaarst wegen
 *   (gewicht = (fractie hartslagreserve)³): één harde run zegt meer dan vijf
 *   rustige.
 */
function runThresholdFromHr(state: State, person: Person, asOf: string): Anchor | null {
  const lthr = thresholdHr(state, person, asOf);
  if (!lthr) return null;
  const rhr = restingHr(state, person);
  const xs = window(state, person, asOf, 42)
    .filter((w) => catOf(w) === 'run' && (w.stats?.tijdMin ?? 0) >= 20 && w.stats?.gemHr)
    .map((w) => {
      const pace = derivedSpeed(w);
      const hr = Math.min(w.stats.gemHr!, lthr);
      const frac = (hr - rhr) / (lthr - rhr);
      if (!pace || frac < 0.5) return null;
      const factor = Math.min(1.25, 1 / frac);
      return { v: pace / factor, d: w.date, w: frac ** 3 };
    })
    .filter((x): x is { v: number; d: string; w: number } => !!x)
    .slice(-6);
  if (!xs.length) return null;
  const latest = xs[xs.length - 1].d;
  const conf = confidenceOf(xs.length, ageOf(latest, asOf));
  const sw = xs.reduce((s, x) => s + x.w, 0);
  return {
    value: xs.reduce((s, x) => s + x.v * x.w, 0) / sw,
    n: xs.length,
    latest,
    basis: [`${xs.length} run${xs.length === 1 ? '' : 's'} met hartslag, doorgetrokken naar omslag ${lthr}`],
    // een schatting via hartslag is nooit zo goed als een echte drempelsessie
    confidence: conf === 'hoog' ? 'gemiddeld' : conf
  };
}

/** Tempo in zone 2: long en easy runs waarbij de gemiddelde HR in zone 2 bleef. */
export function runZ2(state: State, person: Person, asOf: string): Anchor | null {
  const z = zone2(state, person);
  if (!z.high) return null;
  const xs = window(state, person, asOf, 42)
    .filter((w) => catOf(w) === 'run' && ['long', 'easy'].includes(kindOf(w)))
    .filter((w) => w.stats?.gemHr && w.stats.gemHr <= z.high! + 2)
    .map((w) => ({ v: derivedSpeed(w), d: w.date }))
    .filter((x): x is { v: number; d: string } => x.v != null);
  if (!xs.length) return null;
  const latest = xs[xs.length - 1].d;
  return {
    value: recencyAvg(xs.map((x) => x.v)),
    n: xs.length,
    latest,
    basis: [`${xs.length} run${xs.length === 1 ? '' : 's'} met hartslag ≤ ${z.high}`],
    confidence: confidenceOf(xs.length, ageOf(latest, asOf))
  };
}

/** Lengte van de recente long runs: mediaan van de laatste drie, in km. */
export function longRunKm(state: State, person: Person, asOf: string): Anchor | null {
  const xs = window(state, person, asOf, 42)
    .filter((w) => catOf(w) === 'run' && kindOf(w) === 'long' && (w.stats?.afstand ?? 0) > 0)
    .slice(-3);
  if (!xs.length) return null;
  const latest = xs[xs.length - 1].date;
  return {
    value: median(xs.map((w) => w.stats.afstand!)),
    n: xs.length,
    latest,
    basis: xs.map((w) => `${w.stats.afstand!.toFixed(1).replace('.', ',')} km op ${day(w.date)}`),
    confidence: confidenceOf(xs.length, ageOf(latest, asOf))
  };
}

/* ================= fietsen ================= */

/**
 * Hoeveel km/u de wind een rit kostte (positief) of opleverde. Grof model:
 * tegenwind kost meer dan meewind oplevert. Bij ±25 km/u wind en de helft van
 * de rit tegen scheelt dat ±2 km/u op het gemiddelde.
 */
export function windPenaltyKmh(w: Workout): number {
  const wind = w.wind;
  if (!wind) return 0;
  const kmh = wind.speedKmh ?? (wind.bft != null ? BFT_KMH[wind.bft] : null);
  if (!kmh) return 0;
  const dist = w.stats?.afstand ?? 0;
  let head = 0;
  let tail = 0;
  if (wind.headKm != null && dist > 0) {
    head = Math.min(1, wind.headKm / dist);
    tail = wind.tailKm != null ? Math.min(1, wind.tailKm / dist) : Math.max(0, 0.9 - head);
  } else if (wind.dir === 'tegen') {
    head = 0.7;
    tail = 0.2;
  } else if (wind.dir === 'mee') {
    head = 0.2;
    tail = 0.7;
  } else {
    head = 0.4;
    tail = 0.4;
  }
  return 0.25 * kmh * (head - 0.7 * tail);
}

/** Duursnelheid uit duurritten van minstens 45 minuten, windgecorrigeerd. */
export function bikeEndurance(state: State, person: Person, asOf: string) {
  const rides = window(state, person, asOf, 56).filter(
    (w) => catOf(w) === 'fiets' && kindOf(w) === 'endurance' && (w.stats?.tijdMin ?? 0) >= 45
  );
  const xs = rides
    .map((w) => {
      const v = derivedSpeed(w);
      return v ? { v: v + windPenaltyKmh(w), d: w.date, min: w.stats.tijdMin!, wind: !!w.wind } : null;
    })
    .filter((x): x is { v: number; d: string; min: number; wind: boolean } => !!x)
    .slice(-6);
  if (!xs.length) return { speed: null, minutes: null };
  const latest = xs[xs.length - 1].d;
  const conf = confidenceOf(xs.length, ageOf(latest, asOf));
  const windy = xs.filter((x) => x.wind).length;
  return {
    speed: {
      value: recencyAvg(xs.map((x) => x.v)),
      n: xs.length,
      latest,
      basis: [
        `${xs.length} duurrit${xs.length === 1 ? '' : 'ten'}` +
          (windy ? `, ${windy} gecorrigeerd voor wind` : ', zonder windgegevens')
      ],
      // zonder wind is een snelheid een gok: hooguit 'gemiddeld'
      confidence: windy ? conf : conf === 'hoog' ? 'gemiddeld' : conf
    } as Anchor,
    minutes: {
      value: median(xs.slice(-3).map((x) => x.min)),
      n: xs.length,
      latest,
      basis: [],
      confidence: conf
    } as Anchor
  };
}

export function ftpAnchor(state: State, person: Person): Anchor | null {
  const ftp = state.settings[person]?.ftp;
  if (!ftp) return null;
  return {
    value: ftp,
    n: 1,
    latest: '',
    basis: [`FTP ${ftp} W (${state.settings[person]?.z2Source === 'garmin' ? 'uit intervals.icu' : 'ingesteld'})`],
    confidence: 'gemiddeld'
  };
}

/* ================= zwemmen ================= */

/**
 * CSS (critical swim speed). Uit setherhalingen van 100–400 m: dat tempo met
 * korte rust ligt vlak bij CSS. Zonder sets: het gemiddelde van hele sessies,
 * iets sneller gemaakt omdat daar inzwemmen en techniek in zitten.
 */
export function css(state: State, person: Person, asOf: string): Anchor | null {
  const swims = window(state, person, asOf, 56).filter((w) => catOf(w) === 'zwem');
  const reps: { v: number; d: string; label: string }[] = [];
  for (const w of swims) {
    for (const b of w.structure ?? []) {
      const p = blockActualAvg(b);
      if (p && b.workDistM && b.workDistM >= 100 && b.workDistM <= 400) {
        reps.push({ v: p, d: w.date, label: `${b.reps}×${b.workDistM} m op ${day(w.date)}` });
      }
    }
  }
  if (reps.length) {
    const r = reps.slice(-4);
    const latest = r[r.length - 1].d;
    return {
      value: recencyAvg(r.map((x) => x.v)),
      n: r.length,
      latest,
      basis: r.map((x) => x.label),
      confidence: confidenceOf(r.length, ageOf(latest, asOf))
    };
  }
  const whole = swims
    .map((w) => ({ v: derivedSpeed(w), d: w.date }))
    .filter((x): x is { v: number; d: string } => x.v != null)
    .slice(-4);
  if (!whole.length) return null;
  const latest = whole[whole.length - 1].d;
  return {
    value: recencyAvg(whole.map((x) => x.v)) * 0.95,
    n: whole.length,
    latest,
    basis: [`gemiddelde van ${whole.length} zwemsessie${whole.length === 1 ? '' : 's'} (zonder sets)`],
    confidence: 'laag'
  };
}

/* ================= raceklaar: kan je lichaam de afstand aan? ================= */

/**
 * Snelheid zegt nog niet of je 5 uur volhoudt. Wie nooit verder dan 50 km
 * fietste of nooit van de fiets af ging lopen, haalt in de race niet het tempo
 * dat zijn korte trainingen beloven. Dit meet hoeveel van de race-belasting je
 * al gedaan hebt, over de laatste 8 weken:
 *
 * - langste rit tegenover 90 km;
 * - langste run tegenover 18 km (meer hoeft niet voor een 70.3);
 * - langste zwemsessie tegenover 1.900 m;
 * - duurvolume: uren per week (zonder kracht) tegenover 8;
 * - brick-trainingen: een rit en een run op dezelfde dag, tegenover 3.
 *
 * Per onderdeel een score van 0 tot 1. De fiets weegt vooral de langste rit;
 * de run ook de fiets (90 km rijden is wat de run zwaar maakt) en de bricks.
 */
export type Readiness = {
  bikeLongKm: number;
  runLongKm: number;
  swimLongM: number;
  weeklyHours: number;
  bricks: number;
  bike: number;
  run: number;
  swim: number;
  notes: { bike: string; run: string; swim: string };
};

const frac = (v: number, target: number) => Math.max(0, Math.min(1, v / target));

export function readinessFrom(r: Pick<Readiness, 'bikeLongKm' | 'runLongKm' | 'swimLongM' | 'weeklyHours' | 'bricks'>): Readiness {
  const bikeL = frac(r.bikeLongKm, 90);
  const runL = frac(r.runLongKm, 18);
  const vol = frac(r.weeklyHours, 8);
  const brick = frac(r.bricks, 3);
  const km = (v: number) => (v ? `${Math.round(v)} km` : 'nog niets');
  return {
    ...r,
    bike: 0.7 * bikeL + 0.3 * vol,
    run: 0.35 * bikeL + 0.3 * runL + 0.2 * vol + 0.15 * brick,
    swim: frac(r.swimLongM, 1900),
    notes: {
      bike: `langste rit ${km(r.bikeLongKm)} (race 90 km) · ${fmtNum(r.weeklyHours)} u/week`,
      run: `langste run ${km(r.runLongKm)} · ${r.bricks ? `${r.bricks} brick${r.bricks === 1 ? '' : 's'}` : 'nog nooit van de fiets af gelopen'}`,
      swim: `langste zwemsessie ${Math.round(r.swimLongM)} m (race 1.900 m)`
    }
  };
}

const fmtNum = (v: number) => v.toFixed(1).replace('.', ',');

export function readiness(state: State, person: Person, asOf: string): Readiness {
  const ws = window(state, person, asOf, 56);
  const dist = (cat: string) =>
    Math.max(0, ...ws.filter((w) => catOf(w) === cat).map((w) => w.stats?.afstand ?? 0));
  const recent = window(state, person, asOf, 28).filter((w) => catOf(w) !== 'kracht');
  const hours = recent.reduce((s, w) => s + (w.stats?.tijdMin ?? 0), 0) / 60 / 4;
  const days = new Map<string, Set<string>>();
  for (const w of ws) {
    const c = catOf(w);
    if (c === 'run' || c === 'fiets') (days.get(w.date) ?? days.set(w.date, new Set()).get(w.date)!).add(c);
  }
  const bricks = Array.from(days.values()).filter((s) => s.has('run') && s.has('fiets')).length;
  return readinessFrom({
    bikeLongKm: dist('fiets'),
    runLongKm: dist('run'),
    swimLongM: dist('zwem'),
    weeklyHours: hours,
    bricks
  });
}

/**
 * Hoe trouw je traint: afgevinkt van gepland, maal hoe vaak je traint
 * (duursessies per week over de laatste 4 weken tegenover 5). Bepaalt hoeveel
 * van de opbouw de projectie naar 18 april mag aannemen.
 */
export function adherence(state: State, person: Person, asOf: string): number {
  const recent = window(state, person, asOf, 28).filter((w) => catOf(w) !== 'kracht');
  const planned = Object.values(state.workouts).filter(
    (w) =>
      w.person === person &&
      catOf(w) !== 'kracht' &&
      w.date < asOf &&
      w.date >= iso(addDays(fromIso(asOf), -28))
  );
  const done = planned.length ? recent.length / planned.length : 0;
  return Math.max(0, Math.min(1, done)) * frac(recent.length / 4, 5);
}

/* ================= alles samen, met cache ================= */

const cache = new WeakMap<State, Map<string, Anchors>>();

export function anchors(state: State, person: Person, asOf: string): Anchors {
  let m = cache.get(state);
  if (!m) cache.set(state, (m = new Map()));
  const key = person + asOf;
  const hit = m.get(key);
  if (hit) return hit;

  const bike = bikeEndurance(state, person, asOf);
  const a: Anchors = {
    z2: zone2(state, person),
    runThreshold: runThreshold(state, person, asOf),
    runZ2: runZ2(state, person, asOf),
    longRunKm: longRunKm(state, person, asOf),
    bikeEndurance: bike.speed,
    bikeEnduranceMin: bike.minutes,
    ftp: ftpAnchor(state, person),
    css: css(state, person, asOf)
  };
  m.set(key, a);
  return a;
}

export const fmtAnchorPace = (a: Anchor | null, unit: '/km' | '/100m') =>
  a ? `${fmtPace(a.value)} ${unit}` : '—';
