import { GOAL_SPLITS, RACE, RACE_DIST } from './config';
import { addDays, fmtHM, fmtPace, fmtDec, fromIso, iso } from './calc';
import { anchors, type Anchors, type Confidence } from './fitness';
import type { Person, State } from './types';

/**
 * Eindtijdmodel voor de 70.3 van Valencia.
 *
 * Het oude model middelde alle trainingen van zes weken — en mat daardoor
 * vooral wélke trainingen je deed. Dit model rekent per onderdeel vanaf één
 * fitheidsmaat die echt iets zegt (drempeltempo, CSS, FTP of windgecorrigeerde
 * duursnelheid) en zet die om naar race-intensiteit:
 *
 * - zwem 1,9 km: (CSS + 4 s/100m) × 1,03 voor oriënteren en golfslag in zee
 *   × 0,95 voor de wetsuit (half april 15–18 °C, wetsuit toegestaan);
 * - fiets 90 km: met wattmeter 76% van FTP (age-groupers boven 80% blazen
 *   hun run op) omgezet naar snelheid op een vlak parcours; zonder wattmeter
 *   windgecorrigeerde duursnelheid × 1,12 (race-intensiteit ±8% boven zone 2,
 *   plus afgesloten wegen, geen stops, aeropositie en taper);
 * - run 21,1 km: drempeltempo ÷ 0,88 — 70.3-runs liggen op ±86–91% van de
 *   drempelsnelheid na 90 km fietsen;
 * - wissels: 8 minuten.
 *
 * Twee getallen: als je vandaag racet, en een projectie naar 18 april op basis
 * van de trend per onderdeel (gedempt en begrensd). De marge komt uit de data:
 * hoe minder en hoe ouder de metingen, hoe breder.
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
  missing?: string;
  goal: number;
};

export type Estimate = {
  legs: Record<LegKey, Leg>;
  wissels: number;
  complete: boolean;
  total: number | null;
  margin: number | null;
};

export type RaceView = {
  today: Estimate;
  projected: Estimate;
  weeksLeft: number;
  /** Onderdeel met het grootste tekort op de 5:00-verdeling (in minuten). */
  biggestGap: { key: LegKey; minutes: number } | null;
};

const UNC: Record<Confidence, number> = { hoog: 0.03, gemiddeld: 0.06, laag: 0.1 };

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

/* ================= per onderdeel ================= */

function swimLeg(a: Anchors): Leg {
  const goal = GOAL_SPLITS.zwem;
  if (!a.css) {
    return {
      key: 'zwem', min: null, pace: null, confidence: null, basis: [], goal,
      method: 'CSS + 4 s, +3% open water, −5% wetsuit',
      missing: 'Zwem een set (bv. 6 × 200 m) en vul je tijden per herhaling in.'
    };
  }
  const pace = (a.css.value + 4 / 60) * 1.03 * 0.95;
  return {
    key: 'zwem',
    min: pace * (RACE_DIST.zwemM / 100),
    pace,
    confidence: a.css.confidence,
    basis: [`CSS ${fmtPace(a.css.value)} /100m`, ...a.css.basis],
    method: 'CSS + 4 s, +3% open water, −5% wetsuit',
    goal
  };
}

function bikeLeg(state: State, person: Person, a: Anchors): Leg {
  const goal = GOAL_SPLITS.fiets;
  const kg = latestWeight(state, person);
  if (a.ftp && kg) {
    const kmh = speedFromPower(a.ftp.value * 0.76, kg);
    return {
      key: 'fiets',
      min: (RACE_DIST.fietsKm / kmh) * 60,
      pace: kmh,
      confidence: a.ftp.confidence,
      basis: [...a.ftp.basis, `${Math.round(a.ftp.value * 0.76)} W racevermogen, ${fmtDec(kg)} kg`],
      method: '76% van FTP, vlak parcours',
      goal
    };
  }
  if (!a.bikeEndurance) {
    return {
      key: 'fiets', min: null, pace: null, confidence: null, basis: [], goal,
      method: 'duursnelheid (windgecorrigeerd) × 1,12',
      missing: 'Rijd een duurrit van minstens 45 minuten.'
    };
  }
  const kmh = a.bikeEndurance.value * 1.12;
  return {
    key: 'fiets',
    min: (RACE_DIST.fietsKm / kmh) * 60,
    pace: kmh,
    confidence: a.bikeEndurance.confidence,
    basis: [`duursnelheid ${fmtDec(a.bikeEndurance.value)} km/u`, ...a.bikeEndurance.basis],
    method: 'duursnelheid (windgecorrigeerd) × 1,12',
    goal
  };
}

function runLeg(a: Anchors): Leg {
  const goal = GOAL_SPLITS.run;
  if (a.runThreshold) {
    const pace = a.runThreshold.value / 0.88;
    return {
      key: 'run',
      min: pace * RACE_DIST.runKm,
      pace,
      confidence: a.runThreshold.confidence,
      basis: [`drempeltempo ${fmtPace(a.runThreshold.value)} /km`, ...a.runThreshold.basis],
      method: 'drempeltempo ÷ 0,88 (na 90 km fietsen)',
      goal
    };
  }
  if (a.runZ2) {
    // zonder drempelmeting: racetempo ligt grofweg 10% boven zone-2-tempo
    const pace = a.runZ2.value * 0.9;
    return {
      key: 'run',
      min: pace * RACE_DIST.runKm,
      pace,
      confidence: 'laag',
      basis: [`zone-2-tempo ${fmtPace(a.runZ2.value)} /km`, ...a.runZ2.basis],
      method: 'zone-2-tempo × 0,90 (geen drempelmeting)',
      goal
    };
  }
  return {
    key: 'run', min: null, pace: null, confidence: null, basis: [], goal,
    method: 'drempeltempo ÷ 0,88',
    missing: 'Doe een threshold-run (bv. 2 × 12 min) of een run van 20+ minuten.'
  };
}

export function estimateAt(state: State, person: Person, asOf: string): Estimate {
  const a = anchors(state, person, asOf);
  const legs = { zwem: swimLeg(a), fiets: bikeLeg(state, person, a), run: runLeg(a) };
  const list = Object.values(legs);
  const complete = list.every((l) => l.min != null);
  const wissels = GOAL_SPLITS.wissels;
  const total = complete ? list.reduce((s, l) => s + l.min!, 0) + wissels : null;
  const margin = complete
    ? Math.sqrt(list.reduce((s, l) => s + (l.min! * UNC[l.confidence!]) ** 2, 0))
    : null;
  return { legs, wissels, complete, total, margin };
}

/* ================= projectie ================= */

const MAX_WEEKLY = 0.01;

/**
 * Projectie naar 18 april: per onderdeel de verandering van de laatste zes
 * weken, omgerekend per week, begrensd op ±1% per week en gehalveerd (vooruitgang
 * vlakt af), doorgetrokken naar de race. Elke week verder weg maakt de marge
 * 0,4% breder.
 */
export function raceView(state: State, person: Person, asOf = iso(new Date())): RaceView {
  const today = estimateAt(state, person, asOf);
  const before = estimateAt(state, person, iso(addDays(fromIso(asOf), -42)));
  const weeksLeft = Math.max(0, (+RACE - +fromIso(asOf)) / (7 * 86400000));

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
    legs[k] = {
      ...now,
      min: now.min != null ? now.min * factor : null,
      pace:
        now.pace != null
          ? k === 'fiets'
            ? now.pace / factor
            : now.pace * factor
          : null
    };
  }
  const list = Object.values(legs);
  const complete = list.every((l) => l.min != null);
  const total = complete ? list.reduce((s, l) => s + l.min!, 0) + today.wissels : null;
  const margin = complete
    ? Math.sqrt(
        list.reduce((s, l) => s + (l.min! * (UNC[l.confidence!] + 0.004 * weeksLeft)) ** 2, 0)
      )
    : null;
  const projected: Estimate = { legs, wissels: today.wissels, complete, total, margin };

  const gaps = list
    .filter((l) => l.min != null)
    .map((l) => ({ key: l.key, minutes: l.min! - l.goal }))
    .filter((g) => g.minutes > 0.5)
    .sort((a, b) => b.minutes - a.minutes);

  return { today, projected, weeksLeft, biggestGap: gaps[0] ?? null };
}

export const LEG_LABEL: Record<LegKey, string> = { zwem: 'zwemmen', fiets: 'fietsen', run: 'lopen' };

/** De geschreven analyse onderaan het dashboard. */
export function raceSummary(view: RaceView, naam: string, consPct: number | null, lastVolume: number, nDone: number): string {
  if (!nDone) {
    return 'Nog geen afgeronde trainingen. Zodra je trainingen afvinkt — of je Garmin ze binnenhaalt — begint hier de analyse.';
  }
  const bits: string[] = [`${naam} heeft <b>${nDone} ${nDone === 1 ? 'training' : 'trainingen'}</b> afgerond.`];

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
        `Met de huidige trend kom je op 18 april rond <b>${fmtHM(projected.total!)}</b>.`
    );
    if (projected.total! <= 300) {
      bits.push('Dat is onder de 5 uur — vasthouden en niet blesseren.');
    } else if (view.biggestGap) {
      bits.push(
        `Voor sub-5 moet er nog ${fmtHM(projected.total! - 300)} af; het grootste tekort zit in het ${LEG_LABEL[view.biggestGap.key]} (${Math.round(view.biggestGap.minutes)} min boven de 5:00-verdeling).`
      );
    }
  } else {
    const missing = (Object.values(today.legs) as Leg[]).filter((l) => l.min == null);
    bits.push(`Voor een eindtijd mis ik nog: ${missing.map((l) => `<b>${LEG_LABEL[l.key]}</b> (${l.missing})`).join('; ')}`);
  }

  if (lastVolume > 0 && lastVolume < 4) {
    bits.push(`Weekvolume (${fmtDec(lastVolume)}u) is aan de lage kant voor een 70.3 — bouw richting 7–9u per week.`);
  }
  if (lastVolume >= 9) bits.push(`Let op: ${fmtDec(lastVolume)}u in één week is fors. Herstel is ook training.`);
  return bits.join(' ');
}
