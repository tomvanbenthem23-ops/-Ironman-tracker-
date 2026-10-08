import { describe, expect, it } from 'vitest';
import { assignKinds, kindLists, plannedKind, weekAdvice } from './advice';
import { emptyState, type State, type Workout } from './types';

let n = 0;
const wo = (o: Partial<Workout> & { type: string; date: string }): Workout => ({
  id: `a${n++}`,
  person: 'tom',
  stats: {},
  ...o
});
const state = (ws: Workout[]): State => {
  const s = emptyState();
  for (const w of ws) s.workouts[w.id] = w;
  return s;
};

/** Fitheid eind september: drempel 4:28, CSS 2:07, duurrit 27 km/u over 60 km. */
const fitness = [
  wo({
    type: 'korte_run', date: '2026-09-26', kind: 'threshold', stats: { done: true },
    structure: [{ reps: 2, workDurS: 1200, actual: [4.47, 4.47] }]
  }),
  wo({
    type: 'zwem', date: '2026-09-25', stats: { done: true, afstand: 1500, tijdMin: 35 },
    structure: [{ reps: 6, workDistM: 200, actual: Array(6).fill(2.12) }]
  }),
  wo({ type: 'lange_fiets', date: '2026-09-27', stats: { done: true, afstand: 60, tijdMin: 133 } }),
  wo({ type: 'lange_run', date: '2026-09-29', kind: 'long', stats: { done: true, afstand: 14, tijdMin: 82 } })
];

describe('kindLists', () => {
  const r = { bikeLongKm: 60, swimLongM: 1500 };

  it('wisselt in opbouwweken threshold en interval af, met de long run voorop', () => {
    expect(kindLists('build', 0, false, r, true).run).toEqual(['long', 'threshold', 'easy']);
    expect(kindLists('build', 1, false, r, true).run).toEqual(['long', 'interval', 'easy']);
  });

  it('laat de lange rit voorgaan zolang die ver van 90 km is', () => {
    expect(kindLists('build', 0, false, r, true).fiets[0]).toBe('endurance');
    expect(kindLists('build', 0, false, { ...r, bikeLongKm: 80 }, true).fiets[0]).toBe('tempo');
    expect(kindLists('build', 1, true, { ...r, bikeLongKm: 80 }, true).fiets[0]).toBe('interval');
  });

  it('zwemt sets zolang je CSS te traag is, anders eerst de afstand', () => {
    expect(kindLists('build', 0, false, r, true).zwem[0]).toBe('sets');
    expect(kindLists('build', 0, false, r, false).zwem[0]).toBe('continuous');
    expect(kindLists('build', 0, false, { ...r, swimLongM: 2000 }, false).zwem[0]).toBe('sets');
  });

  it('heeft in een rustweek geen harde trainingen', () => {
    const l = kindLists('rest', 3, false, r, true);
    for (const k of [...l.run, ...l.fiets, ...l.zwem]) {
      expect(['threshold', 'interval', 'tempo', 'sets']).not.toContain(k);
    }
  });
});

describe('assignKinds', () => {
  it('geeft elk type eerst zijn eigen soort, de rest het volgende advies', () => {
    const lange = wo({ type: 'lange_run', date: '2026-10-17' });
    const korte = wo({ type: 'korte_run', date: '2026-10-13' });
    const out = assignKinds(['long', 'threshold', 'easy'], [korte, lange], 'run');
    expect(out[lange.id]).toBe('long');
    expect(out[korte.id]).toBe('threshold');
  });

  it('laat een zelf gekozen soort zijn plek innemen, en extra trainingen rustig', () => {
    const own = wo({ type: 'korte_run', date: '2026-10-13', kind: 'threshold' });
    const a = wo({ type: 'korte_run', date: '2026-10-15' });
    const b = wo({ type: 'korte_run', date: '2026-10-16' });
    const c = wo({ type: 'korte_run', date: '2026-10-18' });
    const out = assignKinds(['long', 'threshold', 'easy'], [own, a, b, c], 'run');
    expect(out[own.id]).toBeUndefined();
    // korte runs: eerst wat er naast long over is, long pas als niets anders rest
    expect([out[a.id], out[b.id], out[c.id]]).toEqual(['easy', 'long', 'easy']);
  });
});

describe('weekAdvice', () => {
  it('geeft geen advies in september', () => {
    expect(weekAdvice(state(fitness), 'tom', '2026-09-28')).toBeNull();
  });

  it('adviseert per discipline twee trainingen, met één belangrijkste', () => {
    const adv = weekAdvice(state(fitness), 'tom', '2026-10-12')!;
    expect(adv.weekKind).toBe('build');
    expect(adv.sessions.filter((s) => s.cat === 'run')).toHaveLength(2);
    expect(adv.sessions.filter((s) => s.cat === 'fiets')).toHaveLength(2);
    expect(adv.sessions.filter((s) => s.cat === 'zwem')).toHaveLength(2);
    expect(adv.sessions.filter((s) => s.key)).toHaveLength(1);
    expect(adv.sessions.every((s) => s.why.length > 0)).toBe(true);
    expect(adv.focus).toContain('5:00 vraagt');
  });

  it('telt wat er gepland is', () => {
    const korte = wo({ type: 'korte_run', date: '2026-10-14' });
    const adv = weekAdvice(state([...fitness, korte]), 'tom', '2026-10-12')!;
    expect(adv.planned).toEqual({ run: 1, fiets: 0, zwem: 0 });
    expect(adv.advised.run).toBe(2);
  });

  it('noemt een brick zolang je er nog geen drie deed', () => {
    const adv = weekAdvice(state(fitness), 'tom', '2026-10-12')!;
    expect(adv.tips.some((t) => t.startsWith('Brick'))).toBe(true);
  });
});

describe('plannedKind', () => {
  it('volgt het weekadvies, of je eigen keuze', () => {
    // week van 12 okt: één opbouwweek gehad → interval; 19 okt → threshold; 26 okt is rustweek
    const k12 = wo({ type: 'korte_run', date: '2026-10-14' });
    const k19 = wo({ type: 'korte_run', date: '2026-10-21' });
    const k26 = wo({ type: 'korte_run', date: '2026-10-28' });
    const own = wo({ type: 'korte_run', date: '2026-11-04', kind: 'easy' });
    const s = state([...fitness, k12, k19, k26, own]);
    expect(plannedKind(s, k12)).toBe('interval');
    expect(plannedKind(s, k19)).toBe('threshold');
    expect(plannedKind(s, k26)).toBe('easy');
    expect(plannedKind(s, own)).toBe('easy');
  });

  it('laat trainingen van vóór oktober en kracht op hun type staan', () => {
    const sept = wo({ type: 'korte_run', date: '2026-09-30' });
    const core = wo({ type: 'core', date: '2026-10-14' });
    const s = state([...fitness, sept, core]);
    expect(plannedKind(s, sept)).toBe('interval');
    expect(plannedKind(s, core)).toBe('strength');
  });
});
