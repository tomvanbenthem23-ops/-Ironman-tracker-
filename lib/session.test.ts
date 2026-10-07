import { describe, expect, it } from 'vitest';
import {
  blockActualAvg,
  fmtDur,
  isStrength,
  kindOf,
  parseDistM,
  parseDurS,
  structureSummary,
  weekLoad,
  weekVolume
} from './calc';
import { blocksToRows, rowsToBlocks } from './blocks';
import { emptyState, type Workout } from './types';

const w = (type: string, extra: Partial<Workout> = {}): Workout => ({
  id: type,
  person: 'tom',
  type,
  date: '2026-10-06',
  stats: {},
  ...extra
});

/* ================= soort ================= */

describe('kindOf', () => {
  it('valt terug op de standaard van het type voor oude sessies', () => {
    expect(kindOf(w('lange_run'))).toBe('long');
    expect(kindOf(w('korte_run'))).toBe('interval');
    expect(kindOf(w('easy_run'))).toBe('easy');
    expect(kindOf(w('lange_fiets'))).toBe('endurance');
    expect(kindOf(w('swim2000'))).toBe('continuous');
    expect(kindOf(w('core'))).toBe('strength');
  });

  it('laat een gekozen soort voorgaan', () => {
    expect(kindOf(w('korte_run', { kind: 'threshold' }))).toBe('threshold');
  });
});

/* ================= kracht ================= */

describe('kracht telt niet mee in volume en load', () => {
  it('ook niet als er van vóór oktober nog tijd en RPE bij staan', () => {
    const s = emptyState();
    s.workouts = {
      a: w('core', { id: 'a', stats: { done: true, tijdMin: 59, rpe: 5 } }),
      b: w('lange_run', { id: 'b', stats: { done: true, tijdMin: 60, rpe: 4 } })
    };
    expect(isStrength(s.workouts.a)).toBe(true);
    expect(weekVolume(s, 'tom', '2026-10-05')).toBeCloseTo(1, 6); // alleen de run
    expect(weekLoad(s, 'tom', '2026-10-05')).toBe(240);
  });
});

/* ================= inlezen ================= */

describe('parseDistM', () => {
  it('leest meters en kilometers', () => {
    expect(parseDistM('800')).toBe(800);
    expect(parseDistM('800 m')).toBe(800);
    expect(parseDistM('1,2 km')).toBeCloseTo(1200, 6);
    expect(parseDistM('1.5km')).toBeCloseTo(1500, 6);
    expect(parseDistM('2')).toBe(2000); // kaal getal onder 50 is km
    expect(parseDistM('')).toBeNull();
  });
});

describe('parseDurS', () => {
  it('leest minuten, mm:ss en seconden', () => {
    expect(parseDurS('20')).toBe(1200);
    expect(parseDurS('20 min')).toBe(1200);
    expect(parseDurS('1:30')).toBe(90);
    expect(parseDurS('90 s')).toBe(90);
    expect(parseDurS('45s')).toBe(45);
    expect(parseDurS('2 mins')).toBe(120);
  });
});

describe('fmtDur', () => {
  it('schrijft rustpauzes leesbaar', () => {
    expect(fmtDur(90)).toBe('1:30');
    expect(fmtDur(1200)).toBe('20 min');
    expect(fmtDur(45)).toBe('45 s');
  });
});

/* ================= structuur ================= */

describe('rowsToBlocks', () => {
  it('maakt van "6 × 800 m @ 4:00, rust 1:30" een blok', () => {
    const [b] = rowsToBlocks(
      [{ reps: '6', work: '800 m', speed: '4:00', rest: 'rust 1:30', actual: '' }],
      'korte_run'
    );
    expect(b).toEqual({ reps: 6, workDistM: 800, speed: 4, restDurS: 90 });
  });

  it('herkent tijdblokken: "2 × 20 min @ 4:24"', () => {
    const [b] = rowsToBlocks(
      [{ reps: '2', work: '20 min', speed: '4:24', rest: '3:00', actual: '4:22, 4:25' }],
      'korte_run'
    );
    expect(b.workDurS).toBe(1200);
    expect(b.workDistM).toBeUndefined();
    expect(b.speed).toBeCloseTo(4.4, 6);
    expect(b.actual?.[0]).toBeCloseTo(4 + 22 / 60, 6);
    expect(b.actual).toHaveLength(2);
  });

  it('zwemsets in meters: "7 × 200"', () => {
    const [b] = rowsToBlocks(
      [{ reps: '7', work: '200', speed: '1:50', rest: '20 s', actual: '' }],
      'zwem'
    );
    expect(b).toEqual({ reps: 7, workDistM: 200, speed: 1 + 50 / 60, restDurS: 20 });
  });

  it('fietst op km/u of op watt', () => {
    const [kmh, watt] = rowsToBlocks(
      [
        { reps: '3', work: '12 min', speed: '32', rest: '4 min', actual: '' },
        { reps: '2', work: '20 min', speed: '210 W', rest: '5 min', actual: '' }
      ],
      'korte_fiets'
    );
    expect(kmh.speed).toBe(32);
    expect(watt.watts).toBe(210);
    expect(watt.speed).toBeUndefined();
  });

  it('slaat lege of halve rijen over', () => {
    expect(
      rowsToBlocks(
        [
          { reps: '', work: '800', speed: '', rest: '', actual: '' },
          { reps: '4', work: '', speed: '', rest: '', actual: '' }
        ],
        'korte_run'
      )
    ).toEqual([]);
  });

  it('gaat heen en terug zonder verlies', () => {
    const blocks = rowsToBlocks(
      [{ reps: '6', work: '800 m', speed: '4:00', rest: '1:30', actual: '4:01, -, 3:57' }],
      'korte_run'
    );
    const back = rowsToBlocks(blocksToRows(blocks, 'korte_run'), 'korte_run');
    expect(back).toEqual(blocks);
    expect(back[0].actual?.[1]).toBeNull(); // gemiste herhaling blijft gemist
  });
});

describe('structureSummary', () => {
  it('toont het gerealiseerde gemiddelde als dat er is, anders het doel', () => {
    expect(
      structureSummary([{ reps: 6, workDistM: 800, speed: 4, actual: [4, 3.9, null] }], 'korte_run')
    ).toBe('6×800 m · gem. 3:57 /km');
    expect(structureSummary([{ reps: 2, workDurS: 1200, speed: 4.4 }], 'korte_run')).toBe(
      '2×20 min @ 4:24 /km'
    );
    expect(structureSummary([], 'korte_run')).toBe('');
  });

  it('negeert gemiste herhalingen in het gemiddelde', () => {
    expect(blockActualAvg({ reps: 3, actual: [4, null, 3.8] })).toBeCloseTo(3.9, 6);
    expect(blockActualAvg({ reps: 3 })).toBeNull();
  });
});
