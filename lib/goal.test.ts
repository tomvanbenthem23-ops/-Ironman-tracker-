import { describe, expect, it } from 'vitest';
import { goalView, requiredFtp, verdictFor, weeksToTaper } from './goal';
import { REQUIRED } from './prescribe';
import { speedFromPower } from './race';
import { emptyState, type State, type Workout } from './types';

let n = 0;
const wo = (o: Partial<Workout> & { type: string; date: string }): Workout => ({
  id: `g${n++}`,
  person: 'tom',
  stats: {},
  ...o
});
const state = (ws: Workout[], extra: Partial<State> = {}): State => {
  const s = emptyState();
  for (const w of ws) s.workouts[w.id] = w;
  return { ...s, ...extra };
};

/** Zoals Tom begin oktober: CSS 2:07, drempel ±4:28, duursnelheid 27,3. */
const tom = (d = '2026-10-01') => [
  wo({
    type: 'korte_run', date: d, kind: 'threshold', stats: { done: true },
    structure: [{ reps: 2, workDurS: 1200, actual: [4.28 / Math.pow(60 / 40, 0.06), 4.28 / Math.pow(60 / 40, 0.06)] }]
  }),
  wo({ type: 'zwem', date: d, stats: { done: true }, structure: [{ reps: 6, workDistM: 200, actual: Array(6).fill(2 + 7 / 60) }] }),
  wo({ type: 'lange_fiets', date: d, stats: { done: true, afstand: 27.3 * 2, tijdMin: 120 } })
];

describe('wat 5:00 vraagt', () => {
  it('rekent tot de taper van 5 april', () => {
    expect(weeksToTaper('2026-10-07')).toBeCloseTo(25.7, 1);
    expect(weeksToTaper('2027-04-10')).toBe(1); // na de taper: minstens één week
  });

  it('noemt de vereiste waarden van de 5:00-verdeling', () => {
    const v = goalView(state(tom()), 'tom', '2026-10-07');
    const by = Object.fromEntries(v.legs.map((l) => [l.key, l]));
    expect(by.fiets.need).toBeCloseTo(31.5, 1); // 35,3 / 1,12
    expect(by.run.need).toBeCloseTo(REQUIRED.runThreshold, 6); // 4:15
    expect(by.zwem.need).toBeCloseTo(REQUIRED.swimCss, 6); // 1:55
  });

  it('rekent het verschil in snelheid en per week', () => {
    const v = goalView(state(tom()), 'tom', '2026-10-07');
    const bike = v.legs.find((l) => l.key === 'fiets')!;
    expect(bike.gap!).toBeCloseTo(31.51 / 27.3 - 1, 2); // ±15% sneller
    expect(bike.perWeek!).toBeCloseTo(Math.pow(1 + bike.gap!, 1 / v.weeks) - 1, 6);
    const run = v.legs.find((l) => l.key === 'run')!;
    expect(run.gap!).toBeCloseTo(4.28 / REQUIRED.runThreshold - 1, 2); // tempo: lager is beter
  });

  it('beoordeelt per onderdeel tegen wat haalbaar is', () => {
    expect(verdictFor('fiets', 0.0055)).toBe('unlikely');
    expect(verdictFor('fiets', 0.003)).toBe('ambitious');
    expect(verdictFor('run', 0.002)).toBe('realistic');
    expect(verdictFor('zwem', 0.0045)).toBe('ambitious');
    expect(verdictFor('run', 0)).toBe('met');
  });

  it('ziet bij Tom de fiets als de sprong', () => {
    const v = goalView(state(tom()), 'tom', '2026-10-07');
    expect(v.legs.find((l) => l.key === 'fiets')!.verdict).toBe('unlikely');
    expect(v.hardest?.key).toBe('fiets');
  });

  it('meldt al op niveau en ontbrekende metingen', () => {
    const quirijnSwim = wo({
      type: 'zwem', date: '2026-10-01', stats: { done: true },
      structure: [{ reps: 6, workDistM: 200, actual: Array(6).fill(1 + 51 / 60) }]
    });
    const v = goalView(state([quirijnSwim]), 'tom', '2026-10-07');
    expect(v.legs.find((l) => l.key === 'zwem')!.verdict).toBe('met');
    expect(v.legs.find((l) => l.key === 'run')!.verdict).toBe('missing');
    expect(v.realistic).toBeNull();
  });

  it('rekent met vermogen als er een FTP en gewicht zijn', () => {
    const kg = 78;
    const ftp = requiredFtp(kg);
    expect(speedFromPower(ftp * 0.76, kg)).toBeCloseTo(REQUIRED.bikeKmh, 0);
    const s = state(tom(), { settings: { tom: { ftp: 200 } }, garmin: { tom: { '2026-09-28': { gewicht: kg } } } });
    const bike = goalView(s, 'tom', '2026-10-07').legs.find((l) => l.key === 'fiets')!;
    expect(bike.unit).toBe('watt');
    expect(bike.gap!).toBeCloseTo(Math.cbrt(ftp / 200) - 1, 6); // vermogen → snelheid
  });

  it('geeft een realistisch doel tussen ambitieus en geen groei', () => {
    const v = goalView(state(tom()), 'tom', '2026-10-07');
    expect(v.ambitious!).toBeLessThan(v.realistic!);
    expect(v.realistic!).toBeGreaterThan(300); // bij Tom: sub-5 is niet realistisch
  });
});
