import { describe, expect, it } from 'vitest';
import {
  activityStats,
  activityWind,
  disciplineOf,
  inferKind,
  intervalsToStructure,
  kmhToBft,
  matchActivities,
  paletteTypeFor,
  speedToUnit,
  wellnessToWeeks,
  zonesFromSettings,
  type IcuActivity,
  type IcuInterval
} from './icu-map';
import type { Workout } from './types';

/* ================= voorbeelddata in de vorm van de intervals.icu-API ================= */

/** m/s bij een tempo in min/km. */
const ms = (minPerKm: number) => 1000 / (minPerKm * 60);

const rec = (s: number): IcuInterval => ({ type: 'RECOVERY', elapsed_time: s, moving_time: s });

/** 6 × 800 m rond 4:00/km met 1:30 rust, plus in- en uitlopen. */
const intervals6x800: IcuInterval[] = [
  { type: 'RECOVERY', distance: 2000, moving_time: 660, elapsed_time: 660 },
  ...[4.0, 3.97, 3.95, 4.02, 3.98, 3.93].flatMap((p, i) => [
    {
      type: 'WORK',
      distance: 800 + (i % 2 ? 4 : -3),
      moving_time: Math.round(0.8 * p * 60),
      average_speed: ms(p),
      average_heartrate: 168 + i
    } as IcuInterval,
    ...(i < 5 ? [rec(90)] : [])
  ]),
  { type: 'RECOVERY', distance: 1500, moving_time: 540, elapsed_time: 540 }
];

/** 2 × 20 min drempel op de weg: afstanden verschillen, tijd is gelijk. */
const intervals2x20: IcuInterval[] = [
  rec(600),
  { type: 'WORK', distance: 4560, moving_time: 1200, average_speed: ms(4.39), average_heartrate: 171 },
  rec(180),
  { type: 'WORK', distance: 4510, moving_time: 1195, average_speed: ms(4.42), average_heartrate: 173 },
  rec(480)
];

const run = (o: Partial<IcuActivity>): IcuActivity => ({
  id: 'i1',
  start_date_local: '2026-10-10T07:30:00',
  type: 'Run',
  source: 'GARMIN_CONNECT',
  distance: 10000,
  moving_time: 3300,
  average_speed: ms(5.5),
  average_heartrate: 150,
  max_heartrate: 168,
  total_elevation_gain: 40,
  ...o
});

const planned = (o: Partial<Workout>): Workout => ({
  id: 'p1',
  person: 'tom',
  type: 'korte_run',
  date: '2026-10-10',
  stats: {},
  ...o
});

/* ================= discipline & eenheden ================= */

describe('disciplineOf', () => {
  it('kent run, fiets en zwem; kracht en de rest worden overgeslagen', () => {
    expect(disciplineOf('Run')).toBe('run');
    expect(disciplineOf('TrailRun')).toBe('run');
    expect(disciplineOf('VirtualRide')).toBe('fiets');
    expect(disciplineOf('OpenWaterSwim')).toBe('zwem');
    expect(disciplineOf('WeightTraining')).toBeNull();
    expect(disciplineOf('Walk')).toBeNull();
  });
});

describe('speedToUnit', () => {
  it('zet m/s om naar min/km, min/100m en km/u', () => {
    expect(speedToUnit(ms(5.5), 'run')).toBeCloseTo(5.5, 6);
    expect(speedToUnit(100 / 120, 'zwem')).toBeCloseTo(2.0, 6); // 2:00 /100m
    expect(speedToUnit(10, 'fiets')).toBeCloseTo(36, 6);
    expect(speedToUnit(0, 'run')).toBeNull();
  });
});

describe('kmhToBft', () => {
  it('schaalt naar Beaufort', () => {
    expect(kmhToBft(0.5)).toBe(0);
    expect(kmhToBft(2)).toBe(1);
    expect(kmhToBft(15)).toBe(3);
    expect(kmhToBft(20)).toBe(4);
    expect(kmhToBft(30)).toBe(5);
    expect(kmhToBft(45)).toBe(6);
  });
});

/* ================= intervallen → structuur ================= */

describe('intervalsToStructure', () => {
  it('maakt van een baansessie 6 × 800 m met tempo per herhaling', () => {
    const [b, ...rest] = intervalsToStructure(intervals6x800, 'run', 3600)!;
    expect(rest).toHaveLength(0);
    expect(b.reps).toBe(6);
    expect(b.workDistM).toBe(800);
    expect(b.workDurS).toBeUndefined();
    expect(b.restDurS).toBe(90);
    expect(b.actual).toHaveLength(6);
    expect(b.actual![2]).toBeCloseTo(3.95, 2);
    expect(b.actualHr![0]).toBe(168);
  });

  it('maakt van een drempelsessie op de weg 2 × 20 min', () => {
    const [b] = intervalsToStructure(intervals2x20, 'run', 3700)!;
    expect(b.reps).toBe(2);
    expect(b.workDurS).toBe(1200);
    expect(b.workDistM).toBeUndefined();
    expect(b.actual![0]).toBeCloseTo(4.39, 2);
  });

  it('ziet auto-laps niet als intervallen: 16 aaneengesloten km is gewoon een long run', () => {
    const laps: IcuInterval[] = Array.from({ length: 16 }, () => ({
      type: 'WORK', distance: 1000, moving_time: 360, average_speed: ms(6)
    }));
    expect(intervalsToStructure(laps, 'run', 5800)).toBeNull();
    // fiets: 5-km-laps idem
    const ride: IcuInterval[] = Array.from({ length: 6 }, () => ({
      type: 'WORK', distance: 5000, moving_time: 660, average_speed: 7.5
    }));
    expect(intervalsToStructure(ride, 'fiets', 4000)).toBeNull();
  });

  it('laat losse rondes weg en houdt hooguit twee blokken', () => {
    const w = (d: number, p: number): IcuInterval => ({
      type: 'WORK', distance: d, moving_time: Math.round((d / 1000) * p * 60), average_speed: ms(p)
    });
    const mixed: IcuInterval[] = [
      w(1000, 5.5), rec(60), // losse inloop-ronde met rust: één herhaling, valt weg
      w(400, 3.8), rec(90), w(400, 3.8), rec(90), w(400, 3.8), rec(90),
      w(1000, 4.1), rec(90), w(1000, 4.1), rec(90), w(1000, 4.1), rec(90), w(1000, 4.1), rec(90),
      w(200, 3.5), rec(60), w(200, 3.5), rec(60)
    ];
    const s = intervalsToStructure(mixed, 'run', 3000)!;
    expect(s).toHaveLength(2);
    expect(s.map((b) => `${b.reps}×${b.workDistM}`)).toEqual(['3×400', '4×1000']);
  });

  it('ziet één werkinterval over bijna de hele run als duurloop', () => {
    const one = [{ type: 'WORK', distance: 16000, moving_time: 5600, average_speed: ms(5.8) }];
    expect(intervalsToStructure(one, 'run', 5800)).toBeNull();
    expect(intervalsToStructure([], 'run', 5800)).toBeNull();
  });

  it('rondt zwemsets af op 25 m: 7 × 200', () => {
    const sets: IcuInterval[] = Array.from({ length: 7 }, (_, i) => [
      { type: 'WORK', distance: 200 + (i % 2), moving_time: 220, average_speed: 200 / 220 },
      rec(20)
    ]).flat();
    const [b] = intervalsToStructure(sets, 'zwem', 1800)!;
    expect(b).toMatchObject({ reps: 7, workDistM: 200, restDurS: 20 });
    expect(b.actual![0]).toBeCloseTo(1 + 50 / 60, 2); // 1:50 /100m
  });
});

/* ================= soort ================= */

describe('inferKind', () => {
  it('herkent interval, threshold, long en easy', () => {
    const s800 = intervalsToStructure(intervals6x800, 'run', 3600);
    const s20 = intervalsToStructure(intervals2x20, 'run', 3700);
    expect(inferKind(run({}), 'run', s800)).toBe('interval');
    expect(inferKind(run({}), 'run', s20)).toBe('threshold');
    expect(inferKind(run({ distance: 16000, moving_time: 5800 }), 'run', null)).toBe('long');
    expect(inferKind(run({ distance: 8000, moving_time: 2700 }), 'run', null)).toBe('easy');
  });
});

describe('paletteTypeFor', () => {
  it('kiest het type van de fase', () => {
    expect(paletteTypeFor('run', 'long', '2026-10-10', 90)).toBe('lange_run');
    expect(paletteTypeFor('run', 'easy', '2026-10-10', 40)).toBe('korte_run');
    expect(paletteTypeFor('run', 'easy', '2027-01-10', 40)).toBe('easy_run');
    expect(paletteTypeFor('fiets', 'endurance', '2026-10-10', 120)).toBe('lange_fiets');
    expect(paletteTypeFor('fiets', 'endurance', '2027-02-10', 150)).toBe('bike150');
    expect(paletteTypeFor('zwem', 'sets', '2027-02-10', 40)).toBe('swim_int');
  });
});

/* ================= velden ================= */

describe('activityStats', () => {
  it('neemt tijd, afstand, hartslag en hoogte over in tracker-eenheden', () => {
    const s = activityStats(run({}), 'run');
    expect(s).toMatchObject({ done: true, tijdMin: 55, afstand: 10, gemHr: 150, maxHr: 168, hoogte: 40 });
    expect(s.snelheid).toBeNull();
  });

  it('zwemafstand in meters, zonder hoogte', () => {
    const s = activityStats(
      run({ type: 'Swim', distance: 1500, total_elevation_gain: 3 }),
      'zwem'
    );
    expect(s.afstand).toBe(1500);
    expect(s.hoogte).toBeNull();
  });

  it('vermogen alleen als het van een echte wattmeter komt', () => {
    const base = { type: 'Ride', distance: 50000, icu_average_watts: 190 };
    expect(activityStats(run({ ...base, device_watts: true }), 'fiets').vermogen).toBe(190);
    expect(activityStats(run({ ...base, device_watts: false }), 'fiets').vermogen).toBeNull();
  });
});

describe('activityWind', () => {
  it('rekent km tegen- en meewind uit de percentages', () => {
    const w = activityWind(
      run({
        type: 'Ride',
        distance: 60000,
        average_wind_speed: 7, // m/s ≈ 25 km/u
        prevailing_wind_deg: 250,
        headwind_percent: 40,
        tailwind_percent: 35
      })
    )!;
    expect(w).toMatchObject({ source: 'auto', headKm: 24, tailKm: 21, crossKm: 15, bft: 4, fromDeg: 250 });
  });

  it('geen wind op de trainer', () => {
    expect(activityWind(run({ type: 'VirtualRide', trainer: true, headwind_percent: 50 }))).toBeNull();
  });
});

/* ================= koppelen aan de planning ================= */

describe('matchActivities', () => {
  it('vult een geplande, nog niet afgevinkte training van dezelfde dag', () => {
    const r = matchActivities('tom', [planned({})], [{ act: run({ id: 'a1' }), intervals: intervals6x800 }]);
    expect(r.matched).toBe(1);
    expect(r.created).toBe(0);
    const w = r.upserts[0];
    expect(w.id).toBe('p1');
    expect(w.type).toBe('korte_run'); // jullie plan blijft leidend
    expect(w.externalId).toBe('a1');
    expect(w.source).toBe('icu');
    expect(w.stats.done).toBe(true);
    expect(w.structure?.[0].reps).toBe(6);
  });

  it('koppelt aan een al met de hand ingevulde training in plaats van te verdubbelen', () => {
    const manual = planned({ id: 'm1', type: 'lange_run', stats: { done: true, tijdMin: 90, rpe: 6 } });
    const r = matchActivities('tom', [manual], [
      { act: run({ id: 'a2', distance: 16000, moving_time: 5700 }), intervals: null }
    ]);
    expect(r.created).toBe(0);
    expect(r.upserts[0].id).toBe('m1');
    expect(r.upserts[0].stats.tijdMin).toBe(95); // Garmin wint van de handmatige tijd
    expect(r.upserts[0].stats.rpe).toBe(6); // maar jullie eigen RPE blijft
  });

  it('werkt bij een tweede sync dezelfde training bij, zonder dubbele', () => {
    const synced = planned({ id: 'p1', externalId: 'a1', source: 'icu', kind: 'threshold', stats: { done: true } });
    const r = matchActivities('tom', [synced], [{ act: run({ id: 'a1' }), intervals: intervals6x800 }]);
    expect(r.updated).toBe(1);
    expect(r.created + r.matched).toBe(0);
    expect(r.upserts[0].kind).toBe('threshold'); // handmatig gekozen soort blijft
  });

  it('maakt een nieuwe training als er niets gepland was', () => {
    const r = matchActivities('tom', [], [
      { act: run({ id: 'a3', distance: 15000, moving_time: 5400 }), intervals: null }
    ]);
    expect(r.created).toBe(1);
    expect(r.upserts[0]).toMatchObject({ type: 'lange_run', kind: 'long', date: '2026-10-10', person: 'tom' });
  });

  it('kijkt niet naar trainingen van de ander of een andere discipline', () => {
    const other = planned({ id: 'q1', person: 'quirijn' });
    const swim = planned({ id: 's1', type: 'zwem' });
    const r = matchActivities('tom', [other, swim], [{ act: run({ id: 'a4' }), intervals: null }]);
    expect(r.created).toBe(1);
    expect(r.upserts[0].id).not.toBe('q1');
    expect(r.upserts[0].id).not.toBe('s1');
  });

  it('koppelt twee runs op één dag aan twee geplande sessies', () => {
    const a = planned({ id: 'p1', type: 'lange_run' });
    const b = planned({ id: 'p2', type: 'korte_run' });
    const r = matchActivities('tom', [a, b], [
      { act: run({ id: 'x2', start_date_local: '2026-10-10T18:00:00' }), intervals: intervals6x800 },
      { act: run({ id: 'x1', start_date_local: '2026-10-10T07:00:00', distance: 15000, moving_time: 5400 }), intervals: null }
    ]);
    expect(r.matched).toBe(2);
    const byExt = Object.fromEntries(r.upserts.map((w) => [w.externalId, w.id]));
    expect(byExt.x1).toBe('p1'); // long run → lange_run
    expect(byExt.x2).toBe('p2'); // interval → korte_run
  });

  it('geeft een long run of duurrit nooit een opbouw, ook niet met rondes en pauzes', () => {
    const pausey: IcuInterval[] = [
      { type: 'WORK', distance: 5000, moving_time: 1700, average_speed: ms(5.7) }, rec(120),
      { type: 'WORK', distance: 5000, moving_time: 1700, average_speed: ms(5.7) }, rec(120),
      { type: 'WORK', distance: 5000, moving_time: 1700, average_speed: ms(5.7) }
    ];
    const r = matchActivities('tom', [planned({ type: 'lange_run' })], [
      { act: run({ id: 'p', distance: 15000, moving_time: 5100 }), intervals: pausey }
    ]);
    expect(r.upserts[0].structure).toBeNull();
  });

  it('ruimt bij opnieuw opbouwen de oude opbouw van een gesyncte duurloop op', () => {
    const junk = planned({
      id: 'old', type: 'lange_run', externalId: 'a9', source: 'icu', stats: { done: true },
      structure: [{ reps: 16, workDistM: 1000 }]
    });
    const r = matchActivities('tom', [junk], [{ act: run({ id: 'a9' }), intervals: [] }]);
    expect(r.upserts[0].structure).toBeNull();
  });

  it('slaat Strava-stubs en krachttraining over', () => {
    const r = matchActivities('tom', [], [
      { act: run({ id: 's', source: 'STRAVA' }), intervals: null },
      { act: run({ id: 'w', type: 'WeightTraining' }), intervals: null }
    ]);
    expect(r.upserts).toHaveLength(0);
  });
});

/* ================= wellness & zones ================= */

describe('wellnessToWeeks', () => {
  it('neemt per week de laatste waarde en wist niets met leeg', () => {
    const out = wellnessToWeeks(
      [
        { id: '2026-10-05', vo2max: 51, restingHR: 48 },
        { id: '2026-10-08', vo2max: 52, weight: null },
        { id: '2026-10-12', restingHR: 46 }
      ],
      { '2026-10-05': { gewicht: 78 } }
    );
    expect(out['2026-10-05']).toEqual({ gewicht: 78, vo2: 52, rhr: 48 });
    expect(out['2026-10-12']).toEqual({ rhr: 46 });
  });

  it('schrijft niets terug als er niets veranderde', () => {
    expect(wellnessToWeeks([{ id: '2026-10-05', vo2max: 52 }], { '2026-10-05': { vo2: 52 } })).toEqual({});
  });
});

describe('zonesFromSettings', () => {
  const real = [
    { types: ['Ride', 'VirtualRide'], ftp: 230, hr_zones: [130, 150, 160] },
    { types: ['Run', 'VirtualRun'], lthr: 172, max_hr: 192, hr_zones: [136, 152, 162, 171, 176, 182, 192] }
  ];

  it('haalt zone 2 uit de hardloopzones', () => {
    expect(zonesFromSettings(real, 185, true)).toMatchObject({
      hrValid: true, z2Low: 137, z2High: 152, lthr: 172, maxHr: 192, ftp: 230
    });
  });

  it('negeert de standaardwaarden van een nieuw intervals.icu-account', () => {
    // max 220 / omslag 200 terwijl je hoogste hartslag 182 is: niet van jou
    const defaults = [
      { types: ['Ride'], ftp: 250 },
      { types: ['Run'], lthr: 200, max_hr: 220, hr_zones: [169, 179, 185, 190, 195, 200, 220] }
    ];
    const z = zonesFromSettings(defaults, 182, false);
    expect(z).toMatchObject({ hrValid: false, z2High: null, lthr: null, maxHr: null, ftp: null });
    expect(z.raw).toEqual({ maxHr: 220, lthr: 200, ftp: 250 });
  });

  it('neemt FTP alleen over als je met een wattmeter rijdt', () => {
    expect(zonesFromSettings(real, 185, false).ftp).toBeNull();
    expect(zonesFromSettings(real, 185, true).ftp).toBe(230);
  });

  it('geeft niets als er geen zones zijn', () => {
    expect(zonesFromSettings([]).z2High).toBeNull();
  });
});
