import { GOAL_SPLITS, RACE, RACE_DIST } from './config';
import { addDays, fmtHM, fmtPace, fmtDec, fromIso, iso } from './calc';
import {
  adherence,
  anchors,
  readiness,
  readinessFrom,
  type Anchors,
  type Confidence,
  type Readiness
} from './fitness';
import type { Person, State } from './types';

/**
 * Eindtijdmodel voor de 70.3 van Valencia.
 *
 * Twee dingen bepalen je racetijd, en het model rekent ze apart:
 *
 * 1. **Hoe snel je bent** — per onderdeel één fitheidsmaat die echt iets zegt
 *    (drempeltempo, CSS, FTP of windgecorrigeerde duursnelheid).
 * 2. **Of je lichaam de afstand aankan** — raceklaar (fitness.ts): langste
 *    rit, langste run, volume en bricks tegenover wat de race vraagt.
 *
 * Een snelle loper die nooit verder dan 50 km fietste, haalt in de race niet
 * het tempo dat zijn korte trainingen beloven. Daarom:
 *
 * - **zwem 1,9 km**: (CSS + 4 s/100m) × 1,03 (oriënteren, golfslag) × 0,95
 *   (wetsuit), plus tot 4% als je nog nooit 1.900 m achter elkaar zwom;
 * - **fiets 90 km**: duursnelheid × (1 + 0,12 × raceklaar-fiets) — de volle
 *   race-intensiteit (+12%: tempo-inspanning, afgesloten wegen, aero, taper)
 *   alleen als je de afstand gewend bent — en daarbovenop vermoeidheid voor
 *   het deel dat langer is dan je langste rit: tijd × (90 / langste)^0,05.
 *   Met wattmeter: 68–76% van FTP, ook naar raceklaar;
 * - **run 21,1 km**: drempeltempo ÷ 0,88 (≈ marathontempo: zo lopen goed
 *   voorbereide age-groupers de 70.3-halve marathon), × tot 20% trager naar
 *   raceklaar-run — van de fiets stappen na 90 km die je nooit reed kost veel;
 * - **wissels**: 8 minuten.
 *
 * "Als je vandaag racet" gebruikt je huidige fitheid en raceklaarheid. De
 * projectie naar 18 april trekt de fitheidstrend door (gedempt, begrensd) en
 * neemt aan dat je raceklaarheid groeit naar rato van hoe trouw je de
 * afgelopen vier weken trainde. De marge komt uit de data.
 */

export type LegKey = 'zwem' | 'fiets' | 'run';

export type Leg = {
  key: LegKey;
  /** Geschatte tijd in minuten, of null als er geen bruikbare meting is. */
  min: number | null;
  /** Racetempo: min/100m, km/u of min/km. */
  pace: number | null;
  confidence: Confidence | null;
  basis: string[];
  method: string;
  /** Raceklaar voor dit onderdeel, 0–1, met uitleg. */
  ready: number;
  readyNote: string;
  missing?: string;
  goal: number;
};

export type Estimate = {
  legs: Record<LegKey, Leg>;
  wissels: number;
  complete: boolean;
  total: number | null;
  margin: number | null;
  readiness: Readiness;
};

export type RaceView = {
  today: Estimate;
  projected: Estimate;
  weeksLeft: number;
  adherence: number;
  /** Onderdeel met het grootste tekort op de 5:00-verdeling (in minuten). */
  biggestGap: { key: LegKey; minutes: number } | null;
};

const UNC: Record<Confidence, number> = { hoog: 0.03, gemiddeld: 0.06, laag: 0.1 };

/** Onzekerheid groeit als je ver van de race-belasting af zit: tot +6%. */
const readyUnc = (ready: number) => 0.06 * (1 - ready);

/* ================= fietsfysica ================= */

/**
 * Snelheid op vlak terrein bij een gegeven vermogen. Aannames: CdA 0,30
 * (racefiets/tijdritopzet zonder pro-positie), rolweerstand 0,005,
 * luchtdichtheid 1,225, 3% verlies in de aandrijving, fiets 9 kg.
 */
export function speedFromPower(watts: number, riderKg: number): number {
  const P = watts * 0.97;
  const m = riderKg + 9;
  const f = (v: number) => 0.5 * 1.225 * 0.3 * v ** 3 + 0.005 * m * 9.81 * v - P;
  let lo = 0;
  let hi = 25;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return lo * 3.6;
}

function latestWeight(state: State, person: Person): number | null {
  const weeks = Object.entries(state.garmin[person] ?? {})
    .filter(([, r]) => r.gewicht)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return weeks.length ? weeks[weeks.length - 1][1].gewicht! : null;
}

/** Vermoeidheid voor het stuk dat langer is dan je ooit reed. */
export function beyondLongest(raceKm: number, longestKm: number): number {
  if (longestKm <= 0) return Math.pow(raceKm / 20, 0.05);
  return longestKm >= raceKm ? 1 : Math.pow(raceKm / longestKm, 0.05);
}

/* ================= per onderdeel ================= */

const pct = (v: number) => `${Math.round(v * 100)}%`;

function swimLeg(a: Anchors, r: Readiness): Leg {
  const goal = GOAL_SPLITS.zwem;
  const method = 'CSS + 4 s, +3% open water, −5% wetsuit';
  const base = { key: 'zwem' as const, goal, method, ready: r.swim, readyNote: r.notes.swim };
  if (!a.css) {
    return {
      ...base, min: null, pace: null, confidence: null, basis: [],
      missing: 'Zwem een set (bv. 6 × 200 m) en vul je tijden per herhaling in.'
    };
  }
  const pace = (a.css.value + 4 / 60) * 1.03 * 0.95 * (1 + 0.04 * (1 - r.swim));
  return {
    ...base,
    min: pace * (RACE_DIST.zwemM / 100),
    pace,
    confidence: a.css.confidence,
    basis: [`CSS ${fmtPace(a.css.value)} /100m`, ...a.css.basis]
  };
}

function bikeLeg(state: State, person: Person, a: Anchors, r: Readiness): Leg {
  const goal = GOAL_SPLITS.fiets;
  const fatigue = beyondLongest(RACE_DIST.fietsKm, r.bikeLongKm);
  const base = { key: 'fiets' as const, goal, ready: r.bike, readyNote: r.notes.bike };
  const kg = latestWeight(state, person);

  if (a.ftp && kg) {
    const intensity = 0.68 + 0.08 * r.bike;
    const kmh = speedFromPower(a.ftp.value * intensity, kg) / fatigue;
    return {
      ...base,
      min: (RACE_DIST.fietsKm / kmh) * 60,
      pace: kmh,
      confidence: a.ftp.confidence,
      basis: [...a.ftp.basis, `${Math.round(a.ftp.value * intensity)} W racevermogen, ${fmtDec(kg)} kg`],
      method: `${pct(intensity)} van FTP (naar raceklaar), vlak parcours`
    };
  }
  if (!a.bikeEndurance) {
    return {
      ...base, min: null, pace: null, confidence: null, basis: [],
      method: 'duursnelheid × raceklaar',
      missing: 'Rijd een duurrit van minstens 45 minuten.'
    };
  }
  const uplift = 1 + 0.12 * r.bike;
  const kmh = (a.bikeEndurance.value * uplift) / fatigue;
  return {
    ...base,
    min: (RACE_DIST.fietsKm / kmh) * 60,
    pace: kmh,
    confidence: a.bikeEndurance.confidence,
    basis: [`duursnelheid ${fmtDec(a.bikeEndurance.value)} km/u`, ...a.bikeEndurance.basis],
    method:
      `duursnelheid × ${fmtDec(uplift, 2)} (raceklaar ${pct(r.bike)})` +
      (fatigue > 1.001 ? `, +${fmtDec((fatigue - 1) * 100)}% voor de km's voorbij je langste rit` : '')
  };
}

function runLeg(a: Anchors, r: Readiness): Leg {
  const goal = GOAL_SPLITS.run;
  const offBike = 1 + 0.2 * (1 - r.run);
  const base = { key: 'run' as const, goal, ready: r.run, readyNote: r.notes.run };
  const tail = ` × ${fmtDec(offBike, 2)} van de fiets af (raceklaar ${pct(r.run)})`;
  if (a.runThreshold) {
    const pace = (a.runThreshold.value / 0.88) * offBike;
    return {
      ...base,
      min: pace * RACE_DIST.runKm,
      pace,
      confidence: a.runThreshold.confidence,
      basis: [`drempeltempo ${fmtPace(a.runThreshold.value)} /km`, ...a.runThreshold.basis],
      method: 'drempeltempo ÷ 0,88' + tail
    };
  }
  if (a.runZ2) {
    // zonder drempelmeting: racetempo ligt grofweg 10% boven zone-2-tempo
    const pace = a.runZ2.value * 0.9 * offBike;
    return {
      ...base,
      min: pace * RACE_DIST.runKm,
      pace,
      confidence: 'laag',
      basis: [`zone-2-tempo ${fmtPace(a.runZ2.value)} /km`, ...a.runZ2.basis],
      method: 'zone-2-tempo × 0,90' + tail
    };
  }
  return {
    ...base, min: null, pace: null, confidence: null, basis: [],
    method: 'drempeltempo ÷ 0,88',
    missing: 'Doe een threshold-run (bv. 2 × 12 min) of een run van 20+ minuten.'
  };
}

export function estimateAt(
  state: State,
  person: Person,
  asOf: string,
  ready: Readiness = readiness(state, person, asOf)
): Estimate {
  const a = anchors(state, person, asOf);
  const legs = { zwem: swimLeg(a, ready), fiets: bikeLeg(state, person, a, ready), run: runLeg(a, ready) };
  return summarize(legs, ready, 0);
}

function summarize(legs: Record<LegKey, Leg>, ready: Readiness, extraUnc: number): Estimate {
  const list = Object.values(legs);
  const complete = list.every((l) => l.min != null);
  const wissels = GOAL_SPLITS.wissels;
  const total = complete ? list.reduce((s, l) => s + l.min!, 0) + wissels : null;
  const margin = complete
    ? Math.sqrt(
        list.reduce(
          (s, l) => s + (l.min! * (UNC[l.confidence!] + readyUnc(l.ready) + extraUnc)) ** 2,
          0
        )
      )
    : null;
  return { legs, wissels, complete, total, margin, readiness: ready };
}

/* ================= projectie ================= */

const MAX_WEEKLY = 0.01;

/**
 * Raceklaar op 18 april, als je blijft trainen zoals de laatste vier weken:
 * het gat tot de race-belasting wordt gedicht naar rato van je trouw.
 */
export function projectReadiness(r: Readiness, adh: number): Readiness {
  const toward = (v: number, target: number) => v + Math.max(0, target - v) * adh;
  return readinessFrom({
    bikeLongKm: toward(r.bikeLongKm, 90),
    runLongKm: toward(r.runLongKm, 18),
    swimLongM: toward(r.swimLongM, 1900),
    weeklyHours: toward(r.weeklyHours, 8),
    bricks: toward(r.bricks, 3)
  });
}

/**
 * Projectie naar 18 april. Fitheid: per onderdeel de verandering van de
 * laatste zes weken, per week, begrensd op ±1% en gehalveerd (vooruitgang
 * vlakt af). Raceklaar: zie projectReadiness. Elke week verder weg maakt de
 * marge 0,4% breder.
 */
export function raceView(state: State, person: Person, asOf = iso(new Date())): RaceView {
  const ready = readiness(state, person, asOf);
  const today = estimateAt(state, person, asOf, ready);
  const weeksLeft = Math.max(0, (+RACE - +fromIso(asOf)) / (7 * 86400000));

  // fitheidstrend apart van raceklaarheid: beide momenten met dezelfde raceklaar
  const before = estimateAt(state, person, iso(addDays(fromIso(asOf), -42)), ready);
  const adh = adherence(state, person, asOf);
  const raceReady = projectReadiness(ready, adh);
  const atRace = estimateAt(state, person, asOf, raceReady);

  const legs = {} as Record<LegKey, Leg>;
  for (const k of ['zwem', 'fiets', 'run'] as LegKey[]) {
    const now = today.legs[k];
    const then = before.legs[k];
    let rate = 0;
    if (now.min != null && then.min != null && then.min > 0) {
      rate = (now.min - then.min) / then.min / 6;
      rate = Math.max(-MAX_WEEKLY, Math.min(MAX_WEEKLY, rate));
    }
    const factor = 1 + rate * 0.5 * weeksLeft;
    const leg = atRace.legs[k];
    legs[k] = {
      ...leg,
      min: leg.min != null ? leg.min * factor : null,
      pace: leg.pace != null ? (k === 'fiets' ? leg.pace / factor : leg.pace * factor) : null
    };
  }
  const projected = summarize(legs, raceReady, 0.004 * weeksLeft);

  const gaps = Object.values(legs)
    .filter((l) => l.min != null)
    .map((l) => ({ key: l.key, minutes: l.min! - l.goal }))
    .filter((g) => g.minutes > 0.5)
    .sort((a, b) => b.minutes - a.minutes);

  return { today, projected, weeksLeft, adherence: adh, biggestGap: gaps[0] ?? null };
}

export const LEG_LABEL: Record<LegKey, string> = { zwem: 'zwemmen', fiets: 'fietsen', run: 'lopen' };

/** De geschreven analyse onderaan het dashboard. */
export function raceSummary(
  view: RaceView,
  naam: string,
  consPct: number | null,
  lastVolume: number,
  nDone: number
): string {
  if (!nDone) {
    return 'Nog geen afgeronde trainingen. Zodra je trainingen afvinkt — of je Garmin ze binnenhaalt — begint hier de analyse.';
  }
  const bits: string[] = [
    `${naam} heeft <b>${nDone} ${nDone === 1 ? 'training' : 'trainingen'}</b> afgerond.`
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

  const { today, projected } = view;
  if (today.complete && projected.complete) {
    bits.push(
      `Als je vandaag zou racen: <b>${fmtHM(today.total!)}</b> (± ${Math.round(today.margin!)} min). ` +
        `Blijf je trainen zoals de laatste vier weken, dan kom je op 18 april rond <b>${fmtHM(projected.total!)}</b>.`
    );
    const r = today.readiness;
    if (r.bike < 0.75) {
      bits.push(
        `Je langste rit is ${Math.round(r.bikeLongKm)} km: dat kost je nu het meest. Ritten richting 90 km maken niet alleen het fietsen sneller maar ook de run erna.`
      );
    }
    if (!r.bricks) {
      bits.push('Je bent nog nooit van de fiets af gaan lopen — een korte brick-run na een duurrit is de goedkoopste winst op de run.');
    }
    if (projected.total! <= 300) {
      bits.push('Dat is onder de 5 uur — vasthouden en niet blesseren.');
    } else if (view.biggestGap) {
      bits.push(
        `Voor sub-5 moet er nog ${fmtHM(projected.total! - 300)} af; het grootste tekort zit in het ${LEG_LABEL[view.biggestGap.key]} (${Math.round(view.biggestGap.minutes)} min boven de 5:00-verdeling).`
      );
    }
  } else {
    const missing = (Object.values(today.legs) as Leg[]).filter((l) => l.min == null);
    bits.push(
      `Voor een eindtijd mis ik nog: ${missing.map((l) => `<b>${LEG_LABEL[l.key]}</b> (${l.missing})`).join('; ')}`
    );
  }

  if (lastVolume > 0 && lastVolume < 4) {
    bits.push(`Weekvolume (${fmtDec(lastVolume)}u) is aan de lage kant voor een 70.3 — bouw richting 7–9u per week.`);
  }
  if (lastVolume >= 9) bits.push(`Let op: ${fmtDec(lastVolume)}u in één week is fors. Herstel is ook training.`);
  return bits.join(' ');
}
