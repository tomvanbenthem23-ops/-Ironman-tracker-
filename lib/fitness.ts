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
  kindOf
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
