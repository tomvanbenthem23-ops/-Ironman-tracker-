import { GOAL_SPLITS, TAPER_WEEK } from './config';
import { fromIso, iso } from './calc';
import { anchors, readinessFrom } from './fitness';
import { REQUIRED } from './prescribe';
import { estimateAt, speedFromPower, type LegKey } from './race';
import type { Person, State } from './types';

/**
 * "Wat 5:00 vraagt": per onderdeel waar je staat, wat sub-5 vraagt, hoeveel
 * verbetering per week dat betekent tot de taper (5 april), en of dat
 * realistisch is. Puur; geen UI.
 *
 * Alles wordt vergeleken in snelheid, zodat "beter" altijd omhoog is. Het gaat
 * uit van het schema volgen (volledige raceklaarheid): de vraag is hier of je
 * snel genoeg kúnt worden, niet of je de afstand aankunt.
 *
 * Wat per week haalbaar is, in snelheid:
 * - zwem: realistisch 0,30%, ambitieus 0,60% — bij beginnende zwemmers levert
 *   techniek veel op;
 * - run: realistisch 0,25%, ambitieus 0,50%;
 * - fiets: realistisch 0,20%, ambitieus 0,35% — snelheid groeit maar met de
 *   derdemachtswortel van je vermogen (luchtweerstand), dus +15% sneller
 *   vraagt ±50% meer vermogen.
 * Dit zijn aannames, en ze staan zo ook in het paneel.
 */

export type Verdict = 'met' | 'realistic' | 'ambitious' | 'unlikely' | 'missing';

export const RATES: Record<LegKey, { realistic: number; ambitious: number }> = {
  zwem: { realistic: 0.003, ambitious: 0.006 },
  run: { realistic: 0.0025, ambitious: 0.005 },
  fiets: { realistic: 0.002, ambitious: 0.0035 }
};

export type GoalLeg = {
  key: LegKey;
  /** Huidige en vereiste waarde in de eenheid van de maat. */
  now: number | null;
  need: number;
  unit: 'pace100' | 'kmh' | 'watt' | 'pacekm';
  /** Benodigde verbetering in snelheid (0,15 = 15% sneller); ≤ 0 = al op niveau. */
  gap: number | null;
  /** Benodigde verbetering per week, in snelheid. */
  perWeek: number | null;
  verdict: Verdict;
  missing?: string;
};

export type GoalView = {
  weeks: number;
  legs: GoalLeg[];
  /** Racetijd bij volledige raceklaarheid en realistische resp. ambitieuze groei. */
  realistic: number | null;
  ambitious: number | null;
  /** Onderdeel dat naar verhouding het meest vraagt. */
  hardest: GoalLeg | null;
};

const WEEK_MS = 7 * 86400000;

export function weeksToTaper(asOf: string): number {
  return Math.max(1, (+TAPER_WEEK - +fromIso(asOf)) / WEEK_MS);
}

export function verdictFor(key: LegKey, perWeek: number): Verdict {
  if (perWeek <= 0) return 'met';
  if (perWeek <= RATES[key].realistic) return 'realistic';
  if (perWeek <= RATES[key].ambitious) return 'ambitious';
  return 'unlikely';
}

/** FTP waarbij 76% ervan op vlak terrein precies de racesnelheid van 5:00 geeft. */
export function requiredFtp(kg: number): number {
  let lo = 50;
  let hi = 600;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (speedFromPower(mid * 0.76, kg) < REQUIRED.bikeKmh) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

function latestWeight(state: State, person: Person): number | null {
  const weeks = Object.entries(state.garmin[person] ?? {})
    .filter(([, r]) => r.gewicht)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return weeks.length ? weeks[weeks.length - 1][1].gewicht! : null;
}

/** Van "nu" naar "nodig" in snelheid; tempo's (lager is beter) worden omgekeerd. */
function leg(
  key: LegKey,
  now: number | null,
  need: number,
  unit: GoalLeg['unit'],
  weeks: number,
  missing: string
): GoalLeg {
  if (now == null) return { key, now, need, unit, gap: null, perWeek: null, verdict: 'missing', missing };
  let gap: number;
  if (unit === 'pace100' || unit === 'pacekm') gap = now / need - 1;
  else if (unit === 'watt') gap = Math.cbrt(need / now) - 1; // vermogen → snelheid
  else gap = need / now - 1;
  const perWeek = gap <= 0 ? 0 : Math.pow(1 + gap, 1 / weeks) - 1;
  return { key, now, need, unit, gap, perWeek, verdict: verdictFor(key, perWeek) };
}

const FULL = readinessFrom({ bikeLongKm: 90, runLongKm: 18, swimLongM: 1900, weeklyHours: 8, bricks: 3 });

export function goalView(state: State, person: Person, asOf = iso(new Date())): GoalView {
  const weeks = weeksToTaper(asOf);
  const a = anchors(state, person, asOf);
  const kg = latestWeight(state, person);

  const swim = leg('zwem', a.css?.value ?? null, REQUIRED.swimCss, 'pace100', weeks,
    'Nog geen CSS: zwem een set (bv. 6 × 200 m).');
  const bike =
    a.ftp && kg
      ? leg('fiets', a.ftp.value, requiredFtp(kg), 'watt', weeks, '')
      : leg('fiets', a.bikeEndurance?.value ?? null, REQUIRED.bikeKmh / 1.12, 'kmh', weeks,
          a.ftp
            ? 'Vul je gewicht in (Garmin-kaart) om op vermogen te rekenen.'
            : 'Nog geen duursnelheid: rijd een duurrit van 45+ minuten.');
  const run = leg('run', a.runThreshold?.value ?? null, REQUIRED.runThreshold, 'pacekm', weeks,
    'Nog geen drempeltempo: doe een threshold-run of een run van 20+ minuten.');
  const legs = [swim, bike, run];

  // racetijd bij volledige raceklaarheid, met groei tot de taper
  const est = estimateAt(state, person, asOf, FULL);
  const projectAt = (which: 'realistic' | 'ambitious') => {
    if (!est.complete) return null;
    let total = est.wissels;
    for (const g of legs) {
      const t = est.legs[g.key].min!;
      const goal = GOAL_SPLITS[g.key];
      if (t <= goal) {
        total += t; // al op 5:00-niveau: geen extra groei aangenomen
        continue;
      }
      const grown = t / Math.pow(1 + RATES[g.key][which], weeks);
      total += Math.max(grown, goal); // groeien tot hooguit het 5:00-niveau
    }
    return total;
  };

  const hardest =
    legs
      .filter((g) => g.perWeek != null && g.perWeek > 0)
      .sort((x, y) => y.perWeek! / RATES[y.key].ambitious - x.perWeek! / RATES[x.key].ambitious)[0] ?? null;

  return { weeks, legs, realistic: projectAt('realistic'), ambitious: projectAt('ambitious'), hardest };
}
