import { describe, expect, it } from 'vitest';
import { GOAL_SPLITS } from './config';
import { anchors, runThreshold, windPenaltyKmh, zone2 } from './fitness';
import {
  buildStep,
  compliance,
  defaultWeekKind,
  prescribe,
  REQUIRED,
  toward,
  weekKind
} from './prescribe';
import { emptyState, type State, type Workout } from './types';

/* ================= helpers ================= */

let n = 0;
const wo = (o: Partial<Workout> & { type: string; date: string }): Workout => ({
  id: `w${n++}`,
  person: 'tom',
  stats: {},
  ...o
});

function state(ws: Workout[], extra: Partial<State> = {}): State {
  const s = emptyState();
  for (const w of ws) s.workouts[w.id] = w;
  return { ...s, ...extra };
}

const withZ2 = (ws: Workout[], extra: Partial<State> = {}) =>
  state(ws, { settings: { tom: { z2Low: 132, z2High: 148, z2Source: 'garmin' } }, ...extra });

const longRun = (date: string, km: number, hr = 145) =>
  wo({ type: 'lange_run', date, stats: { done: true, afstand: km, tijdMin: km * 6, gemHr: hr } });

/* ================= weekritme ================= */

describe('weekritme 3:1', () => {
  it('legt de rustweken op 26 okt, 23 nov, 21 dec, 18 jan, 15 feb en 15 mrt', () => {
    const rest = ['2026-10-26', '2026-11-23', '2026-12-21', '2027-01-18', '2027-02-15', '2027-03-15'];
    for (const d of rest) expect(defaultWeekKind(d)).toBe('rest');
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-11-02', '2027-03-22', '2027-03-29']) {
      expect(defaultWeekKind(d)).toBe('build');
    }
  });

  it('eindigt met taper (5 apr) en raceweek (12 apr)', () => {
    expect(defaultWeekKind('2027-04-07')).toBe('taper');
    expect(defaultWeekKind('2027-04-18')).toBe('race');
  });

  it('laat een week handmatig omzetten, bv. vakantie als rustweek', () => {
    const s = state([], { weekFlags: { '2026-11-09': 'rest' } });
    expect(weekKind(s, '2026-11-11')).toBe('rest');
    expect(weekKind(s, '2026-11-16')).toBe('build');
  });

  it('telt alleen opbouwweken mee voor de ladder', () => {
    const s = state([]);
    expect(buildStep(s, '2026-10-05')).toBe(0);
    expect(buildStep(s, '2026-10-26')).toBe(3); // rustweek zelf: 3 opbouwweken ervoor
    expect(buildStep(s, '2026-11-02')).toBe(3); // na de rustweek gaat het verder waar het was
    expect(buildStep(s, '2026-11-09')).toBe(4);
    expect(buildStep(state([], { weekFlags: { '2026-10-12': 'rest' } }), '2026-11-02')).toBe(2);
  });
});

/* ================= sub-5 ================= */

describe('wat sub-5 vraagt', () => {
  it('telt op tot precies 5 uur', () => {
    const { zwem, fiets, run, wissels } = GOAL_SPLITS;
    expect(zwem + fiets + run + wissels).toBe(300);
  });

  it('rekent racetempo’s en drempel uit', () => {
    expect(REQUIRED.runPace).toBeCloseTo(4.834, 2); // 4:50 /km
    expect(REQUIRED.runThreshold).toBeCloseTo(4.254, 2); // 4:15 /km
    expect(REQUIRED.bikeKmh).toBeCloseTo(35.29, 1);
    expect(REQUIRED.swimPace).toBeCloseTo(1.947, 2); // 1:57 /100m
  });
});

describe('toward', () => {
  it('beweegt naar het doel, maar nooit meer dan 3% voor de huidige fitheid uit', () => {
    expect(toward(4.6, 4.25, 0)).toBeCloseTo(4.6, 6);
    expect(toward(4.6, 4.25, 0.1)).toBeCloseTo(4.565, 3);
    expect(toward(4.6, 4.25, 1)).toBeCloseTo(4.6 * 0.97, 6); // begrensd
    expect(toward(30, 35.3, 1)).toBeCloseTo(30 * 1.03, 6); // snelheid: omhoog
  });
});

/* ================= fitheid ================= */

describe('fitheidsankers', () => {
  it('haalt zone 2 uit de instellingen, anders uit max-HR', () => {
    expect(zone2(withZ2([]), 'tom')).toMatchObject({ low: 132, high: 148 });
    expect(zone2(state([], { settings: { tom: { maxHr: 190 } } }), 'tom')).toMatchObject({
      low: 114,
      high: 133
    });
  });

  it('leest het drempeltempo uit 2 × 20 min via Riegel op de totale werktijd', () => {
    const s = state([
      wo({
        type: 'korte_run',
        date: '2026-10-01',
        kind: 'threshold',
        stats: { done: true },
        structure: [{ reps: 2, workDurS: 1200, actual: [4.4, 4.4] }]
      })
    ]);
    const a = runThreshold(s, 'tom', '2026-10-10')!;
    expect(a.value).toBeCloseTo(4.4 * Math.pow(60 / 40, 0.06), 4);
    expect(a.basis[0]).toContain('2×20 min');
  });

  it('valt zonder blokken terug op de snelste run, met lage betrouwbaarheid', () => {
    const s = state([
      wo({ type: 'lange_run', date: '2026-09-29', stats: { done: true, afstand: 16, tijdMin: 77 } }),
      wo({ type: 'korte_run', date: '2026-10-01', stats: { done: true, afstand: 6, tijdMin: 36 } })
    ]);
    const a = runThreshold(s, 'tom', '2026-10-10')!;
    expect(a.confidence).toBe('laag');
    expect(a.value).toBeCloseTo((77 / 16) * Math.pow(60 / 77, 0.06), 4);
  });

  it('schat zonder drempelsessie het drempeltempo uit tempo + hartslag', () => {
    // zoals Toms september: rustige runs met hartslag, geen harde blokken
    const run = (date: string, km: number, min: number, hr: number, max: number) =>
      wo({ type: 'lange_run', date, stats: { done: true, afstand: km, tijdMin: min, gemHr: hr, maxHr: max } });
    const s = state([
      run('2026-09-14', 10.02, 53.4, 154, 168),
      run('2026-09-20', 16, 97.5, 144, 158),
      run('2026-09-24', 10, 57.3, 150, 182),
      run('2026-09-29', 14.66, 81.7, 156, 181)
    ]);
    const a = runThreshold(s, 'tom', '2026-10-06')!;
    // omslag ≈ 0,92 × 182 = 167, rust 55: rond 4:50 /km in plaats van ±5:22 uit de snelste run
    expect(a.value).toBeGreaterThan(4.6);
    expect(a.value).toBeLessThan(5.0);
    expect(a.basis[0]).toContain('omslag 167');
    expect(a.confidence).not.toBe('hoog');
  });

  it('kijkt alleen naar trainingen vóór de peildatum', () => {
    const s = state([longRun('2026-10-10', 14)]);
    expect(anchors(s, 'tom', '2026-10-10').longRunKm).toBeNull();
    expect(anchors(s, 'tom', '2026-10-11').longRunKm?.value).toBe(14);
  });

  it('corrigeert fietssnelheid voor tegenwind', () => {
    const tegen = wo({
      type: 'lange_fiets',
      date: '2026-10-01',
      stats: { done: true, afstand: 60, tijdMin: 140 },
      wind: { source: 'auto', speedKmh: 25, headKm: 30, tailKm: 18 }
    });
    // helft tegen, 30% mee bij 25 km/u wind: ±1,8 km/u langzamer dan windstil
    expect(windPenaltyKmh(tegen)).toBeCloseTo(0.25 * 25 * (0.5 - 0.7 * 0.3), 6);
    expect(windPenaltyKmh(wo({ type: 'lange_fiets', date: '2026-10-01' }))).toBe(0);
  });
});

/* ================= voorschriften ================= */

describe('long run', () => {
  const sept = [longRun('2026-09-20', 14), longRun('2026-09-27', 15), longRun('2026-10-03', 14.5)];

  it('groeit een halve km per opbouwweek vanaf de recente long runs, in zone 2', () => {
    const s = withZ2([...sept, longRun('2026-10-10', 15), longRun('2026-10-17', 15.5)]);
    const p1 = prescribe(s, wo({ type: 'lange_run', date: '2026-10-11' }))!;
    const p3 = prescribe(s, wo({ type: 'lange_run', date: '2026-10-25' }))!;
    expect(p1.distKm).toBe(14); // start (begrensd op 14) + 0,5 × 0
    expect(p3.distKm).toBe(15); // + 0,5 × 2
    expect(p3.hrMax).toBe(148);
    expect(p3.summary).toBe('15 km · ♥ ≤ 148');
  });

  it('doet in de rustweek ±30% minder', () => {
    const s = withZ2([...sept, longRun('2026-10-10', 15), longRun('2026-10-17', 15.5), longRun('2026-10-24', 16)]);
    const p = prescribe(s, wo({ type: 'lange_run', date: '2026-11-01' }))!; // week van 26 okt
    expect(p.weekKind).toBe('rest');
    expect(p.distKm).toBe(11);
  });

  it('springt nooit meer dan 2 km boven wat je recent echt liep', () => {
    const s = withZ2([longRun('2026-09-27', 9)]);
    const p = prescribe(s, wo({ type: 'lange_run', date: '2026-12-13' }))!; // ladder zou >14 zeggen
    expect(p.distKm).toBeLessThanOrEqual(11);
  });

  it('heeft een plafond: 16 km in fase 1, 19 km in fase 2', () => {
    const many = Array.from({ length: 12 }, (_, i) => longRun(`2026-${i < 6 ? '11' : '12'}-${String(2 + (i % 6) * 4).padStart(2, '0')}`, 18));
    const s = withZ2([...sept, ...many]);
    expect(prescribe(s, wo({ type: 'lange_run', date: '2026-12-27' }))!.distKm).toBeLessThanOrEqual(16);
  });

  it('noemt het tempo een verwachting en vraagt om zone 2 als die ontbreekt', () => {
    const p = prescribe(state(sept), wo({ type: 'lange_run', date: '2026-10-11' }))!;
    expect(p.summary).toContain('zone 2');
    expect(p.missing).toContain('zone 2');
  });
});

describe('kwaliteitstrainingen', () => {
  const thr = wo({
    type: 'korte_run',
    date: '2026-10-01',
    kind: 'threshold',
    stats: { done: true },
    structure: [{ reps: 2, workDurS: 900, actual: [4.5, 4.5] }]
  });

  it('threshold: ladder van 2 × 10 naar 2 × 25 min, tempo net onder je huidige drempel', () => {
    const s = withZ2([thr]);
    const p0 = prescribe(s, wo({ type: 'korte_run', kind: 'threshold', date: '2026-10-08' }))!;
    expect(p0.blocks![0]).toMatchObject({ reps: 2, workDurS: 600, restDurS: 120 });
    const current = 4.5 * Math.pow(60 / 30, 0.06);
    expect(p0.blocks![0].speed!).toBeLessThanOrEqual(current);
    expect(p0.blocks![0].speed!).toBeGreaterThanOrEqual(current * 0.97);

    const later = prescribe(s, wo({ type: 'korte_run', kind: 'threshold', date: '2026-11-16' }))!;
    expect(later.blocks![0].reps * later.blocks![0].workDurS!).toBeGreaterThan(1200);
  });

  it('interval: ±6% sneller dan het drempeldoel', () => {
    const s = withZ2([thr]);
    const t = prescribe(s, wo({ type: 'korte_run', kind: 'threshold', date: '2026-10-08' }))!;
    const i = prescribe(s, wo({ type: 'korte_run', date: '2026-10-08' }))!;
    expect(i.kind).toBe('interval');
    expect(i.blocks![0]).toMatchObject({ reps: 6, workDistM: 800, restDurS: 90 });
    expect(i.blocks![0].speed!).toBeCloseTo(t.blocks![0].speed! * 0.94, 6);
  });

  it('zonder drempelmeting: wel de opbouw, tempo op gevoel', () => {
    const p = prescribe(state([]), wo({ type: 'korte_run', date: '2026-10-08' }))!;
    expect(p.summary).toBe('6×800 m op 5K-gevoel');
    expect(p.missing).toBeTruthy();
  });

  it('zwemsets: 6 × 200 met warm-up en uitzwemmen', () => {
    const p = prescribe(state([]), wo({ type: 'zwem', date: '2026-10-08' }))!;
    expect(p.blocks![0]).toMatchObject({ reps: 6, workDistM: 200, restDurS: 20 });
    expect(p.distM).toBe(1700);
  });

  it('fietsen op vermogen als er een FTP is (Quirijn)', () => {
    const s = state([], { settings: { tom: { ftp: 240 } } });
    const p = prescribe(s, wo({ type: 'korte_fiets', date: '2026-10-08' }))!;
    expect(p.summary).toBe('2×10 min · 204–216 W');
    const e = prescribe(s, wo({ type: 'lange_fiets', date: '2026-10-08' }))!;
    expect(e.summary).toContain('134–180 W');
  });

  it('geeft vóór 5 oktober geen voorschrift: september was warm-up', () => {
    expect(prescribe(state([]), wo({ type: 'korte_run', date: '2026-10-03' }))).toBeNull();
    expect(prescribe(state([]), wo({ type: 'korte_run', date: '2026-10-05' }))).not.toBeNull();
  });

  it('kracht krijgt geen voorschrift', () => {
    expect(prescribe(state([]), wo({ type: 'core', date: '2026-10-08' }))).toBeNull();
  });
});

/* ================= gehaald? ================= */

describe('compliance', () => {
  const s = withZ2([longRun('2026-09-27', 14), longRun('2026-10-03', 14.5)]);
  const plan = (d: Workout) => prescribe(s, d)!;

  it('long run: afstand gehaald en in zone 2', () => {
    const w = longRun('2026-10-11', 14.6, 146);
    expect(compliance(w, plan(w))).toEqual({
      verdict: 'hit',
      notes: ['14,6 van 14 km', '♥ 146, in zone 2']
    });
  });

  it('long run te hard: de hartslag telt, ook als de afstand klopt', () => {
    const w = longRun('2026-10-11', 14.5, 166);
    const c = compliance(w, plan(w))!;
    expect(c.verdict).toBe('miss');
    expect(c.notes[1]).toBe('♥ 166, 18 boven zone 2');
  });

  it('intervallen: gemiddeld tempo en aantal herhalingen', () => {
    const w = wo({
      type: 'korte_run',
      date: '2026-10-08',
      stats: { done: true },
      structure: [{ reps: 5, workDistM: 800, actual: [4.0, 4.0, 4.0, 4.0, 4.0] }]
    });
    const p = { ...plan(w), blocks: [{ reps: 6, workDistM: 800, speed: 4.05 }] };
    const c = compliance(w, p)!;
    expect(c.verdict).toBe('close'); // tempo gehaald, één herhaling gemist
    expect(c.notes).toContain('5 van 6 herhalingen');
  });

  it('nog niet gedaan: geen oordeel', () => {
    const w = wo({ type: 'lange_run', date: '2026-10-11' });
    expect(compliance(w, plan(w))).toBeNull();
  });
});
