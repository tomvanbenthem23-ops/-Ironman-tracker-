import { describe, expect, it } from 'vitest';
import {
  activityStats,
  activityWind,
  disciplineOf,
  estimatedFtp,
  isIndoorRide,
  inferKind,
  intervalsToStructure,
  kmhToBft,
  matchActivities,
  paletteTypeFor,
  speedToUnit,
  streamsToIntervals,
  wellnessToWeeks,
  zonesFromSettings,
  type IcuActivity,
  type IcuInterval,
  type IcuStreams
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
    expect(zonesFromSettings(real, 185)).toMatchObject({
      hrValid: true, z2Low: 137, z2High: 152, lthr: 172, maxHr: 192
    });
  });

  it('negeert de standaardwaarden van een nieuw intervals.icu-account', () => {
    // max 220 / omslag 200 terwijl je hoogste hartslag 182 is: niet van jou
    const defaults = [
      { types: ['Ride'], ftp: 250 },
      { types: ['Run'], lthr: 200, max_hr: 220, hr_zones: [169, 179, 185, 190, 195, 200, 220] }
    ];
    const z = zonesFromSettings(defaults, 182);
    expect(z).toMatchObject({ hrValid: false, z2High: null, lthr: null, maxHr: null, ftp: null });
    expect(z.raw).toEqual({ maxHr: 220, lthr: 200, ftp: 250 });
  });

  it('neemt de FTP uit de instellingen nooit over', () => {
    expect(zonesFromSettings(real, 185).ftp).toBeNull();
  });

  it('geeft niets als er geen zones zijn', () => {
    expect(zonesFromSettings([]).z2High).toBeNull();
  });
});

/* ================= hometrainer ================= */

const ride = (o: Partial<IcuActivity>): IcuActivity =>
  run({ type: 'Ride', distance: 40000, moving_time: 5400, average_speed: 7.4, ...o });

describe('hometrainer', () => {
  it('herkent een rit binnen aan trainer of VirtualRide', () => {
    expect(isIndoorRide(ride({ trainer: true }))).toBe(true);
    expect(isIndoorRide(ride({ type: 'VirtualRide' }))).toBe(true);
    expect(isIndoorRide(ride({}))).toBe(false);
  });

  it('zet een binnenrit automatisch op binnen, zonder wind', () => {
    const p = planned({ id: 'f1', type: 'lange_fiets' });
    const r = matchActivities('tom', [p], [{ act: ride({ id: 'b1', trainer: true }), intervals: null }]);
    expect(r.upserts[0].id).toBe('f1');
    expect(r.upserts[0].indoor).toBe(true);
    expect(r.upserts[0].wind ?? null).toBeNull();
  });

  it('houdt een met de hand gezet vinkje aan bij een volgende sync', () => {
    const synced = planned({ id: 'f2', type: 'lange_fiets', externalId: 'b2', source: 'icu', indoor: false, stats: { done: true } });
    const r = matchActivities('tom', [synced], [{ act: ride({ id: 'b2', trainer: true }), intervals: null }]);
    expect(r.upserts[0].indoor).toBe(false);
  });

  it('schat de FTP uit de nieuwste rit met een echte wattmeter', () => {
    const acts = [
      ride({ id: 'o', start_date_local: '2026-10-01T08:00:00', device_watts: true, icu_rolling_ftp: 210 }),
      ride({ id: 'n', start_date_local: '2026-10-08T08:00:00', device_watts: true, icu_rolling_ftp: 221.6 }),
      // geschat vermogen zonder wattmeter telt niet
      ride({ id: 'x', start_date_local: '2026-10-09T08:00:00', device_watts: false, icu_rolling_ftp: 250 })
    ];
    expect(estimatedFtp(acts)).toBe(222);
    expect(estimatedFtp([ride({ device_watts: false, icu_rolling_ftp: 250 })])).toBeNull();
    expect(estimatedFtp([run({ device_watts: true, icu_rolling_ftp: 300 })])).toBeNull();
  });
});

/* ================= tempoverloop ================= */

/** Meetreeks per seconde uit stukken [seconden, m/s, hartslag]. */
const streamOf = (parts: [number, number, number][]): IcuStreams => {
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];
  let t = 0;
  let d = 0;
  for (const [secs, v, hr] of parts) {
    for (let i = 0; i < secs; i++) {
      time.push(t++);
      d += v;
      distance.push(d);
      heartrate.push(hr);
    }
  }
  return { time, distance, heartrate };
};

/** Zoals Tom op 3 oktober: inlopen, 6 × ±800 m op 4:23 /km met 2 min dribbel, uitlopen. */
const sixBy800 = (stopInRep3 = false) =>
  streamOf([
    [600, 2.8, 140],
    ...Array.from({ length: 6 }, (_, i): [number, number, number][] => [
      ...(stopInRep3 && i === 2
        ? ([[100, 3.8, 166], [20, 0, 160], [110, 3.8, 167]] as [number, number, number][])
        : ([[210, 3.8, 166]] as [number, number, number][])),
      ...(i < 5 ? ([[120, 2.3, 150]] as [number, number, number][]) : [])
    ]).flat(),
    [300, 2.7, 145]
  ]);

describe('streamsToIntervals', () => {
  it('haalt herhalingen uit het tempoverloop als er alleen auto-laps zijn', () => {
    const iv = streamsToIntervals(sixBy800(), 'run')!;
    expect(iv.filter((i) => i.type === 'WORK')).toHaveLength(6);
    expect(iv[0].type).toBe('WARMUP');
    expect(iv[iv.length - 1].type).toBe('COOLDOWN');
    const s = intervalsToStructure(iv, 'run', null, 0.25)!;
    expect(s).toHaveLength(1);
    expect(s[0].reps).toBe(6);
    // precies 210 s per herhaling: de rondste maat is dan de tijd (anders 800 m)
    expect(s[0].workDurS ?? s[0].workDistM).toBe(s[0].workDurS ? 210 : 800);
    expect(s[0].restDurS).toBeGreaterThan(100);
    expect(s[0].restDurS).toBeLessThan(140);
    expect(s[0].actual![0]).toBeCloseTo(1000 / 3.8 / 60, 1);
  });

  it('telt een stoplicht midden in een herhaling niet als rust', () => {
    const iv = streamsToIntervals(sixBy800(true), 'run')!;
    expect(iv.filter((i) => i.type === 'WORK')).toHaveLength(6);
  });

  it('maakt van een duurloop met wisselend tempo geen intervallen', () => {
    const wobble = streamOf(
      Array.from({ length: 50 }, (_, i): [number, number, number] => [60, 2.9 * (1 + 0.04 * Math.sin(i)), 148])
    );
    expect(streamsToIntervals(wobble, 'run')).toBeNull();
  });

  it('herkent heuvels aan de hartslag: bergop trager maar hoger, dat is geen rust', () => {
    const hills = streamOf(
      Array.from({ length: 6 }, (): [number, number, number][] => [[240, 3.4, 145], [180, 2.6, 162]]).flat()
    );
    expect(streamsToIntervals(hills, 'run')).toBeNull();
  });

  it('doet niets met fietsen of zwemmen', () => {
    expect(streamsToIntervals(sixBy800(), 'fiets')).toBeNull();
    expect(streamsToIntervals(sixBy800(), 'zwem')).toBeNull();
  });

  it('vult zo de opbouw bij een intervalrun, maar nooit bij een duurloop', () => {
    const autoLaps: IcuInterval[] = Array.from({ length: 9 }, () => ({
      type: 'WORK',
      distance: 1000,
      moving_time: 330,
      average_speed: 3.03
    }));
    const act = run({ id: 's1', distance: 9200, moving_time: 2970 });
    const r = matchActivities('tom', [planned({ id: 'k1', type: 'korte_run' })], [
      { act, intervals: autoLaps, streams: sixBy800() }
    ]);
    expect(r.upserts[0].structure?.[0].reps).toBe(6);

    const long = matchActivities('tom', [planned({ id: 'l1', type: 'lange_run' })], [
      { act, intervals: autoLaps, streams: sixBy800() }
    ]);
    expect(long.upserts[0].structure).toBeNull();
  });
});

describe('geplande soort bij een volgende sync', () => {
  it('houdt een training zonder eigen soort op het weekadvies, ook als het horloge iets anders zag', () => {
    const first = matchActivities('tom', [planned({ id: 'w1' })], [
      { act: run({ id: 'z1', distance: 8000, moving_time: 2700 }), intervals: null }
    ]);
    expect(first.upserts[0].kind ?? null).toBeNull();
    const second = matchActivities('tom', first.upserts, [
      { act: run({ id: 'z1', distance: 8000, moving_time: 2700 }), intervals: null }
    ]);
    expect(second.updated).toBe(1);
    expect(second.upserts[0].kind ?? null).toBeNull(); // niet 'easy'
  });
});
