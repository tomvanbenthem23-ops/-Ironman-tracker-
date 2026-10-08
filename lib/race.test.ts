import { describe, expect, it } from 'vitest';
import { bikeEndurance, readiness, readinessFrom, windPenaltyKmh } from './fitness';
import {
  beyondLongest,
  estimateAt,
  projectReadiness,
  raceSummary,
  raceView,
  speedFromPower
} from './race';
import { emptyState, type State, type Workout } from './types';

let n = 0;
const wo = (o: Partial<Workout> & { type: string; date: string }): Workout => ({
  id: `r${n++}`,
  person: 'tom',
  stats: {},
  ...o
});
const state = (ws: Workout[], extra: Partial<State> = {}): State => {
  const s = emptyState();
  for (const w of ws) s.workouts[w.id] = w;
  return { ...s, ...extra };
};

/** Iemand die de race-belasting volledig gewend is. */
const FULL = readinessFrom({ bikeLongKm: 95, runLongKm: 18, swimLongM: 2000, weeklyHours: 9, bricks: 3 });
/** Quirijn begin oktober: snel, maar nooit verder dan 51 km gefietst en nooit een brick. */
const QUIRIJN = readinessFrom({ bikeLongKm: 51, runLongKm: 16.3, swimLongM: 1700, weeklyHours: 5, bricks: 0 });

/** Een meting per onderdeel, rond de sub-5-grens. */
const fit = (d: string, thr = 4.3, css = 1.9, bike = 31) => [
  wo({
    type: 'korte_run', date: d, kind: 'threshold', stats: { done: true },
    structure: [{ reps: 2, workDurS: 1200, actual: [thr, thr] }]
  }),
  wo({
    type: 'zwem', date: d, stats: { done: true },
    structure: [{ reps: 6, workDistM: 200, actual: Array(6).fill(css) }]
  }),
  wo({
    type: 'lange_fiets', date: d, stats: { done: true, afstand: (bike * 120) / 60, tijdMin: 120 }
  })
];

describe('speedFromPower', () => {
  it('geeft plausibele vlakke snelheden', () => {
    expect(speedFromPower(180, 75)).toBeGreaterThan(31); // ±32,7 km/u bij CdA 0,30
    expect(speedFromPower(180, 75)).toBeLessThan(35);
    expect(speedFromPower(250, 75)).toBeGreaterThan(speedFromPower(180, 75));
  });
});

describe('raceklaar', () => {
  it('is 100% voor wie de race-belasting gewend is', () => {
    expect(FULL.bike).toBeCloseTo(1, 6);
    expect(FULL.run).toBeCloseTo(1, 6);
    expect(FULL.swim).toBeCloseTo(1, 6);
  });

  it('weegt bij de fiets vooral de langste rit, bij de run ook fiets en bricks', () => {
    expect(QUIRIJN.bike).toBeCloseTo(0.7 * (51 / 90) + 0.3 * (5 / 8), 6);
    expect(QUIRIJN.run).toBeCloseTo(0.35 * (51 / 90) + 0.3 * (16.3 / 18) + 0.2 * (5 / 8), 6);
    expect(QUIRIJN.notes.run).toContain('nog nooit van de fiets af gelopen');
  });

  it('telt een rit en een run op dezelfde dag als brick', () => {
    const s = state([
      wo({ type: 'lange_fiets', date: '2026-10-01', stats: { done: true, afstand: 60, tijdMin: 130 } }),
      wo({ type: 'korte_run', date: '2026-10-01', stats: { done: true, afstand: 4, tijdMin: 22 } }),
      wo({ type: 'korte_run', date: '2026-10-03', stats: { done: true, afstand: 8, tijdMin: 45 } })
    ]);
    const r = readiness(s, 'tom', '2026-10-07');
    expect(r.bricks).toBe(1);
    expect(r.bikeLongKm).toBe(60);
    expect(r.runLongKm).toBe(8);
  });

  it('rekent vermoeidheid voor de km’s voorbij je langste rit', () => {
    expect(beyondLongest(90, 95)).toBe(1);
    expect(beyondLongest(90, 51)).toBeCloseTo(Math.pow(90 / 51, 0.05), 6);
  });
});

describe('estimateAt', () => {
  it('rekent bij volledige raceklaarheid met de bekende omrekeningen', () => {
    const e = estimateAt(state(fit('2026-10-01')), 'tom', '2026-10-07', FULL);
    const thr = 4.3 * Math.pow(60 / 40, 0.06);
    expect(e.legs.run.min).toBeCloseTo((thr / 0.88) * 21.1, 3);
    expect(e.legs.zwem.min).toBeCloseTo((1.9 + 4 / 60) * 1.03 * 0.95 * 19, 3);
    expect(e.legs.fiets.min).toBeCloseTo((90 / (31 * 1.12)) * 60, 3);
    expect(e.total).toBeCloseTo(e.legs.run.min! + e.legs.zwem.min! + e.legs.fiets.min! + 8, 6);
  });

  it('maakt iemand die nooit 90 km fietste en nooit een brick deed flink langzamer', () => {
    const s = state(fit('2026-10-01', 4.25, 1.85, 26.4));
    const ready = estimateAt(s, 'tom', '2026-10-07', FULL);
    const quirijn = estimateAt(s, 'tom', '2026-10-07', QUIRIJN);
    // fiets: minder race-uplift én vermoeidheid voorbij 51 km
    expect(quirijn.legs.fiets.min! - ready.legs.fiets.min!).toBeGreaterThan(10);
    // run: van de fiets af na een afstand die je nooit reed
    expect(quirijn.legs.run.min! / ready.legs.run.min!).toBeGreaterThan(1.05);
    expect(quirijn.total! - ready.total!).toBeGreaterThan(20);
    // en de onzekerheid is groter
    expect(quirijn.margin!).toBeGreaterThan(ready.margin!);
  });

  it('laat een extra rustige run je fitheid niet veranderen', () => {
    // de fout van het eerste model: de trainingsmix telde, niet de fitheid
    const base = [wo({ type: 'lange_run', date: '2026-10-01', stats: { done: true, afstand: 15, tijdMin: 90 } })];
    const plus = [...base, wo({ type: 'easy_run', date: '2026-10-03', stats: { done: true, afstand: 8, tijdMin: 52 } })];
    const a = estimateAt(state(base), 'tom', '2026-10-07', FULL).legs.run.min!;
    const b = estimateAt(state(plus), 'tom', '2026-10-07', FULL).legs.run.min!;
    expect(b).toBeCloseTo(a, 6);
  });

  it('gebruikt bij een FTP en gewicht het vermogen, naar raceklaar', () => {
    const s = state(fit('2026-10-01'), {
      settings: { tom: { ftp: 250 } },
      garmin: { tom: { '2026-09-28': { gewicht: 80 } } }
    });
    const full = estimateAt(s, 'tom', '2026-10-07', FULL);
    expect(full.legs.fiets.method).toContain('76% van FTP');
    expect(full.legs.fiets.pace).toBeCloseTo(speedFromPower(190, 80), 6);
    const low = estimateAt(s, 'tom', '2026-10-07', QUIRIJN);
    expect(low.legs.fiets.pace!).toBeLessThan(full.legs.fiets.pace!);
  });

  it('zegt per ontbrekend onderdeel wat er nodig is', () => {
    const e = estimateAt(state([]), 'tom', '2026-10-07');
    expect(e.complete).toBe(false);
    expect(e.legs.zwem.missing).toContain('6 × 200');
  });
});

describe('projectie', () => {
  it('dicht het gat naar de race-belasting naar rato van hoe trouw je traint', () => {
    expect(projectReadiness(QUIRIJN, 0).bikeLongKm).toBe(51);
    expect(projectReadiness(QUIRIJN, 1).bikeLongKm).toBe(90);
    expect(projectReadiness(QUIRIJN, 0.5).bikeLongKm).toBeCloseTo(70.5, 6);
    expect(projectReadiness(QUIRIJN, 0.5).bike).toBeGreaterThan(QUIRIJN.bike);
  });

  it('trekt de fitheidstrend door, begrensd op 1% per week en gehalveerd', () => {
    const s = state([...fit('2026-08-25', 4.6, 2.0, 28), ...fit('2026-10-05', 4.3, 1.9, 31)]);
    const v = raceView(s, 'tom', '2026-10-07');
    expect(v.projected.total!).toBeLessThan(v.today.total!);
    expect(v.projected.margin!).toBeGreaterThan(0);
  });

  it('noemt het onderdeel met het grootste tekort op de 5:00-verdeling', () => {
    const v = raceView(state(fit('2026-10-05', 4.3, 1.9, 26)), 'tom', '2026-10-07');
    expect(v.biggestGap?.key).toBe('fiets');
  });
});

describe('raceSummary', () => {
  it('benoemt de langste rit en het ontbreken van bricks', () => {
    // fit() zet rit en run op één dag (= een brick); hier de rit een dag eerder
    const ws = fit('2026-10-05', 4.3, 1.9, 26);
    ws[2] = { ...ws[2], date: '2026-10-04' };
    const v = raceView(state(ws), 'tom', '2026-10-07');
    const t = raceSummary(v, 'Tom', 90, 7, 3);
    expect(t).toContain('Als je vandaag zou racen');
    expect(t).toContain('langste rit');
    expect(t).toContain('van de fiets af');
  });

  it('zegt wat er ontbreekt', () => {
    const v = raceView(state([]), 'tom', '2026-10-07');
    expect(raceSummary(v, 'Tom', null, 0, 1)).toContain('mis ik nog');
  });
});

describe('binnen fietsen', () => {
  const windy = { source: 'manual' as const, bft: 5, dir: 'tegen' as const };

  it('rekent binnen geen wind', () => {
    const out = wo({ type: 'lange_fiets', date: '2026-10-01', wind: windy, stats: { done: true, afstand: 50, tijdMin: 120 } });
    expect(windPenaltyKmh(out)).toBeGreaterThan(0);
    expect(windPenaltyKmh({ ...out, indoor: true })).toBe(0);
  });

  it('telt de snelheid van een binnenrit niet mee voor de duursnelheid', () => {
    const s = state([
      wo({ type: 'lange_fiets', date: '2026-10-01', stats: { done: true, afstand: 54, tijdMin: 120 } }),
      wo({ type: 'lange_fiets', date: '2026-10-04', indoor: true, stats: { done: true, afstand: 70, tijdMin: 120 } })
    ]);
    expect(bikeEndurance(s, 'tom', '2026-10-07').speed!.value).toBeCloseTo(27, 6);
    expect(bikeEndurance(s, 'tom', '2026-10-07').speed!.n).toBe(1);
  });

  it('telt een binnenrit voor de raceklaarheid op duur × je snelheid buiten', () => {
    const s = state([
      wo({ type: 'lange_fiets', date: '2026-10-01', stats: { done: true, afstand: 30, tijdMin: 60 } }),
      wo({ type: 'lange_fiets', date: '2026-10-04', indoor: true, stats: { done: true, afstand: 120, tijdMin: 150 } })
    ]);
    // buiten 30 km/u; 150 min binnen = 75 km, niet de 120 km van de trainer
    expect(readiness(s, 'tom', '2026-10-07').bikeLongKm).toBeCloseTo(75, 6);
  });
});
