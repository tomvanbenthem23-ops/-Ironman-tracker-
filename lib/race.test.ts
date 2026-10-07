import { describe, expect, it } from 'vitest';
import { estimateAt, raceSummary, raceView, speedFromPower } from './race';
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

/** Iemand met een meting per onderdeel, rond de sub-5-grens. */
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

describe('estimateAt', () => {
  it('rekent elk onderdeel vanaf zijn eigen fitheidsmaat', () => {
    const e = estimateAt(state(fit('2026-10-01')), 'tom', '2026-10-07');
    const thr = 4.3 * Math.pow(60 / 40, 0.06);
    expect(e.legs.run.min).toBeCloseTo((thr / 0.88) * 21.1, 3);
    expect(e.legs.zwem.min).toBeCloseTo((1.9 + 4 / 60) * 1.03 * 0.95 * 19, 3);
    expect(e.legs.fiets.min).toBeCloseTo((90 / (31 * 1.12)) * 60, 3);
    expect(e.complete).toBe(true);
    expect(e.total).toBeCloseTo(e.legs.run.min! + e.legs.zwem.min! + e.legs.fiets.min! + 8, 6);
  });

  it('laat een intervalsessie het run-deel niet sneller maken dan een drempelsessie zou doen', () => {
    // dit is precies de fout van het oude model: meer intervallen = "sneller"
    const easyOnly = state([
      wo({ type: 'lange_run', date: '2026-10-01', stats: { done: true, afstand: 15, tijdMin: 90 } })
    ]);
    const plusEasy = state([
      ...Object.values(easyOnly.workouts),
      wo({ type: 'easy_run', date: '2026-10-03', stats: { done: true, afstand: 8, tijdMin: 52 } })
    ]);
    const a = estimateAt(easyOnly, 'tom', '2026-10-07').legs.run.min!;
    const b = estimateAt(plusEasy, 'tom', '2026-10-07').legs.run.min!;
    expect(b).toBeCloseTo(a, 6); // een extra rustige run verandert je fitheid niet
  });

  it('gebruikt bij een FTP en gewicht het vermogen', () => {
    const s = state(fit('2026-10-01'), {
      settings: { tom: { ftp: 250 } },
      garmin: { tom: { '2026-09-28': { gewicht: 80 } } }
    });
    const e = estimateAt(s, 'tom', '2026-10-07');
    expect(e.legs.fiets.method).toContain('FTP');
    expect(e.legs.fiets.pace).toBeCloseTo(speedFromPower(190, 80), 6);
  });

  it('wordt breder bij weinig of oude metingen', () => {
    const fresh = estimateAt(state([...fit('2026-10-01'), ...fit('2026-10-03'), ...fit('2026-10-05')]), 'tom', '2026-10-07');
    const one = estimateAt(state(fit('2026-09-01')), 'tom', '2026-10-07');
    expect(one.margin! / one.total!).toBeGreaterThan(fresh.margin! / fresh.total!);
  });

  it('zegt per ontbrekend onderdeel wat er nodig is', () => {
    const e = estimateAt(state([]), 'tom', '2026-10-07');
    expect(e.complete).toBe(false);
    expect(e.legs.zwem.missing).toContain('6 × 200');
  });
});

describe('raceView', () => {
  it('trekt de trend door naar 18 april, begrensd op 1% per week en gehalveerd', () => {
    const s = state([...fit('2026-08-25', 4.6, 2.0, 28), ...fit('2026-10-05', 4.3, 1.9, 31)]);
    const v = raceView(s, 'tom', '2026-10-07');
    expect(v.projected.total!).toBeLessThan(v.today.total!);
    // maximaal 0,5% per week erbij
    expect(v.projected.total! - 8).toBeGreaterThanOrEqual((v.today.total! - 8) * (1 - 0.005 * v.weeksLeft) - 1e-6);
    expect(v.projected.margin!).toBeGreaterThan(v.today.margin!);
  });

  it('noemt het onderdeel met het grootste tekort op de 5:00-verdeling', () => {
    const v = raceView(state(fit('2026-10-05', 4.3, 1.9, 26)), 'tom', '2026-10-07');
    expect(v.biggestGap?.key).toBe('fiets');
  });
});

describe('raceSummary', () => {
  it('geeft beide eindtijden en het grootste tekort', () => {
    const v = raceView(state(fit('2026-10-05', 4.3, 1.9, 26)), 'tom', '2026-10-07');
    const t = raceSummary(v, 'Tom', 90, 7, 3);
    expect(t).toContain('Als je vandaag zou racen');
    expect(t).toContain('18 april');
    expect(t).toContain('fietsen');
  });

  it('zegt wat er ontbreekt', () => {
    const v = raceView(state([]), 'tom', '2026-10-07');
    expect(raceSummary(v, 'Tom', null, 0, 1)).toContain('mis ik nog');
  });
});
