import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  baseline,
  consistency,
  derivedSpeed,
  estimateFinish,
  fmtHM,
  fmtPace,
  fmtTijd,
  iso,
  mondayOf,
  pandaScore,
  parseSpeed,
  parseTijd,
  recentSpeed,
  targetClass,
  targetFor,
  summaryText,
  trend,
  weekNr
} from './calc';
import { DISC_REF, T0, T1 } from './config';
import { emptyState, type Person, type State, type Stats } from './types';

/* ================= helpers ================= */

function st(...ws: { id?: string; type: string; date: string; stats?: Stats }[]): State {
  const s = emptyState();
  ws.forEach((w, i) => {
    const id = w.id ?? `w${i}`;
    s.workouts[id] = {
      id,
      person: 'tom',
      type: w.type,
      date: w.date,
      stats: w.stats ?? {}
    };
  });
  return s;
}

const P: Person = 'tom';
const freeze = (isoDate: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDate + 'T12:00:00'));
};
afterEach(() => vi.useRealTimers());

/* ================= formatteren ================= */

describe('fmtHM', () => {
  it('rondt het totaal af vóór het delen (de 5:60-regressie)', () => {
    expect(fmtHM(359.7)).toBe('6:00');
    expect(fmtHM(359.4)).toBe('5:59');
  });

  it('formatteert gewone waarden', () => {
    expect(fmtHM(300)).toBe('5:00');
    expect(fmtHM(292)).toBe('4:52');
    expect(fmtHM(8)).toBe('0:08');
  });
});

describe('fmtPace / fmtTijd', () => {
  it('rondt 59,7 seconden naar de volgende minuut', () => {
    expect(fmtPace(5.995)).toBe('6:00');
    expect(fmtPace(5.25)).toBe('5:15');
    expect(fmtPace(4.667)).toBe('4:40');
  });

  it('schrijft uren alleen als ze er zijn', () => {
    expect(fmtTijd(45)).toBe('45:00');
    expect(fmtTijd(80.5)).toBe('1:20:30');
  });
});

describe('parseTijd / parseSpeed', () => {
  it('leest mm:ss, h:mm:ss en kale minuten', () => {
    expect(parseTijd('45:00')).toBe(45);
    expect(parseTijd('1:20:30')).toBeCloseTo(80.5, 6);
    expect(parseTijd('45')).toBe(45);
    expect(parseTijd('')).toBeNull();
  });

  it('leest tempo als m:ss en km/u met komma of punt', () => {
    expect(parseSpeed('5:30', 'lange_run')).toBeCloseTo(5.5, 6);
    expect(parseSpeed('31,4', 'lange_fiets')).toBeCloseTo(31.4, 6);
    expect(parseSpeed('31.4', 'lange_fiets')).toBeCloseTo(31.4, 6);
  });
});

/* ================= snelheid ================= */

describe('derivedSpeed', () => {
  const w = (type: string, stats: Stats) => st({ type, date: '2026-09-10', stats }).workouts.w0;

  it('rekent per discipline in de juiste eenheid', () => {
    expect(derivedSpeed(w('lange_run', { tijdMin: 55, afstand: 10 }))).toBeCloseTo(5.5, 6);
    expect(derivedSpeed(w('lange_fiets', { tijdMin: 60, afstand: 32 }))).toBeCloseTo(32, 6);
    expect(derivedSpeed(w('zwem', { tijdMin: 30, afstand: 1500 }))).toBeCloseTo(2.0, 6);
  });

  it('laat een expliciete snelheid voorgaan', () => {
    expect(derivedSpeed(w('lange_run', { tijdMin: 55, afstand: 10, snelheid: 5.0 }))).toBe(5.0);
  });

  it('geeft null zonder tijd of afstand', () => {
    expect(derivedSpeed(w('lange_run', { tijdMin: 55 }))).toBeNull();
    expect(derivedSpeed(w('core', { tijdMin: 45 }))).toBeNull();
  });
});

/* ================= targets ================= */

describe('baseline', () => {
  it('gebruikt het september-gemiddelde van het type zelf', () => {
    const s = st(
      { type: 'lange_run', date: '2026-09-05', stats: { tijdMin: 60, afstand: 10 } }, // 6:00
      { type: 'lange_run', date: '2026-09-12', stats: { tijdMin: 56, afstand: 10 } } // 5:36
    );
    expect(baseline(s, P, 'lange_run')).toBeCloseTo(5.8, 6);
  });

  it('schaalt het disciplinegemiddelde voor een fase-2-type zonder historie', () => {
    const s = st({ type: 'lange_run', date: '2026-09-05', stats: { tijdMin: 60, afstand: 10 } });
    // interval_run heeft geen septemberdata: 6,0 × (4,667 / 5,25)
    expect(baseline(s, P, 'interval_run')).toBeCloseTo(6 * (4.667 / DISC_REF.run), 6);
  });

  it('geeft null zonder septemberdata en voor krachttraining', () => {
    expect(baseline(emptyState(), P, 'lange_run')).toBeNull();
    const s = st({ type: 'lange_run', date: '2026-09-05', stats: { tijdMin: 60, afstand: 10 } });
    expect(baseline(s, P, 'core')).toBeNull();
  });
});

describe('targetFor', () => {
  const sept = st({
    type: 'lange_run',
    date: '2026-09-05',
    stats: { tijdMin: 60, afstand: 10 } // baseline 6:00 /km, doel 5:15
  });

  it('toont niets vóór 1 oktober', () => {
    expect(targetFor(sept, P, 'lange_run', '2026-09-28')).toBeNull();
  });

  it('staat op de baseline bij T0 en op het doel in de raceweek', () => {
    expect(targetFor(sept, P, 'lange_run', iso(T0))).toBeCloseTo(6.0, 6);
    expect(targetFor(sept, P, 'lange_run', iso(T1))).toBeCloseTo(5.25, 6);
  });

  it('interpoleert lineair daartussen', () => {
    const mid = new Date((+T0 + +T1) / 2);
    const t = targetFor(sept, P, 'lange_run', iso(mondayOf(mid)))!;
    const f = (+mondayOf(mid) - +T0) / (+T1 - +T0);
    expect(t).toBeCloseTo(6.0 + (5.25 - 6.0) * f, 6);
    expect(t).toBeGreaterThan(5.25);
    expect(t).toBeLessThan(6.0);
  });

  it('vraagt 4% extra als de baseline al beter is dan het doel', () => {
    const snel = st({
      type: 'lange_run',
      date: '2026-09-05',
      stats: { tijdMin: 50, afstand: 10 } // 5:00 /km, sneller dan het doel van 5:15
    });
    expect(targetFor(snel, P, 'lange_run', iso(T0))).toBeCloseTo(5.0, 6);
    expect(targetFor(snel, P, 'lange_run', iso(T1))).toBeCloseTo(5.0 * 0.96, 6);
  });

  it('doet hetzelfde omgekeerd voor de fiets', () => {
    const snel = st({
      type: 'lange_fiets',
      date: '2026-09-05',
      stats: { tijdMin: 60, afstand: 35 } // 35 km/u, harder dan het doel van 33
    });
    expect(targetFor(snel, P, 'lange_fiets', iso(T1))).toBeCloseTo(35 * 1.04, 6);
  });
});

describe('targetClass', () => {
  it('kleurt tempo: lager is beter', () => {
    expect(targetClass(5.2, 5.25, 'lange_run')).toBe('hit');
    expect(targetClass(5.25, 5.25, 'lange_run')).toBe('hit');
    expect(targetClass(5.4, 5.25, 'lange_run')).toBe('close'); // binnen 5%
    expect(targetClass(5.6, 5.25, 'lange_run')).toBe('miss');
  });

  it('kleurt snelheid: hoger is beter', () => {
    expect(targetClass(34, 33, 'lange_fiets')).toBe('hit');
    expect(targetClass(32, 33, 'lange_fiets')).toBe('close');
    expect(targetClass(30, 33, 'lange_fiets')).toBe('miss');
  });
});

/* ================= vorm & eindtijd ================= */

describe('recentSpeed', () => {
  it('weegt recentere sessies zwaarder', () => {
    freeze('2026-10-15');
    const s = st(
      { type: 'lange_run', date: '2026-10-01', stats: { done: true, tijdMin: 60, afstand: 10 } }, // 6,0
      { type: 'lange_run', date: '2026-10-14', stats: { done: true, tijdMin: 50, afstand: 10 } } // 5,0
    );
    // (6×1 + 5×2) / 3
    expect(recentSpeed(s, P, 'run')!.v).toBeCloseTo(16 / 3, 6);
    expect(recentSpeed(s, P, 'run')!.n).toBe(2);
  });

  it('kijkt niet verder terug dan 42 dagen en negeert niet-afgevinkte sessies', () => {
    freeze('2026-11-20');
    const s = st(
      { type: 'lange_run', date: '2026-09-01', stats: { done: true, tijdMin: 60, afstand: 10 } },
      { type: 'lange_run', date: '2026-11-18', stats: { tijdMin: 50, afstand: 10 } }
    );
    expect(recentSpeed(s, P, 'run')).toBeNull();
  });
});

describe('estimateFinish', () => {
  const vorm = () =>
    st(
      { type: 'zwem', date: '2026-10-10', stats: { done: true, tijdMin: 30, afstand: 1500 } }, // 2:00 /100m
      { type: 'lange_fiets', date: '2026-10-11', stats: { done: true, tijdMin: 60, afstand: 33 } }, // 33 km/u
      { type: 'lange_run', date: '2026-10-12', stats: { done: true, tijdMin: 52.5, afstand: 10 } } // 5:15 /km
    );

  it('rekent de splits met de afgesproken coëfficiënten', () => {
    freeze('2026-10-15');
    const est = estimateFinish(vorm(), P);
    expect(est.complete).toBe(true);
    expect(est.parts.zwem).toBeCloseTo(2.0 * 0.97 * 19, 6);
    expect(est.parts.fiets).toBeCloseTo((90 / (33 * 1.03)) * 60, 6);
    expect(est.parts.run).toBeCloseTo(5.25 * 1.05 * 21.1, 6);
    expect(est.parts.wissels).toBe(8);
    expect(est.total).toBeCloseTo(36.86 + 158.8703 + 116.3138 + 8, 2);
    expect(fmtHM(est.total as number)).toBe('5:20');
  });

  it('geeft geen totaal als een discipline ontbreekt', () => {
    freeze('2026-10-15');
    const s = st({
      type: 'lange_run',
      date: '2026-10-12',
      stats: { done: true, tijdMin: 52.5, afstand: 10 }
    });
    const est = estimateFinish(s, P);
    expect(est.complete).toBe(false);
    expect(est.total).toBeNull();
    expect(est.sw).toBeNull();
  });

  it('bepaalt betrouwbaarheid op de kleinste discipline', () => {
    freeze('2026-10-15');

    // extra sessies bijzetten in alle drie de disciplines
    const met = (n: number) => {
      const s = vorm();
      for (let i = 0; i < n; i++) {
        const dag = '2026-10-0' + (i + 1);
        s.workouts[`z${i}`] = { id: `z${i}`, person: P, type: 'zwem', date: dag,
          stats: { done: true, tijdMin: 30, afstand: 1500 } };
        s.workouts[`f${i}`] = { id: `f${i}`, person: P, type: 'lange_fiets', date: dag,
          stats: { done: true, tijdMin: 60, afstand: 33 } };
        s.workouts[`r${i}`] = { id: `r${i}`, person: P, type: 'lange_run', date: dag,
          stats: { done: true, tijdMin: 52.5, afstand: 10 } };
      }
      return s;
    };

    expect(estimateFinish(vorm(), P).conf).toBe('laag'); // 1 sessie per discipline
    expect(estimateFinish(met(2), P).conf).toBe('gemiddeld'); // 3 per discipline
    expect(estimateFinish(met(5), P).conf).toBe('hoog'); // 6 per discipline
  });

  it('laat één achterblijvende discipline de betrouwbaarheid bepalen', () => {
    freeze('2026-10-15');
    const s = vorm();
    for (let i = 0; i < 8; i++) {
      const dag = '2026-10-0' + ((i % 9) + 1);
      s.workouts[`z${i}`] = { id: `z${i}`, person: P, type: 'zwem', date: dag,
        stats: { done: true, tijdMin: 30, afstand: 1500 } };
      s.workouts[`f${i}`] = { id: `f${i}`, person: P, type: 'lange_fiets', date: dag,
        stats: { done: true, tijdMin: 60, afstand: 33 } };
    }
    // zwem en fiets staan op 9 sessies, de run nog op 1
    expect(estimateFinish(s, P).conf).toBe('laag');
  });
});

/* ================= trends ================= */

describe('trend', () => {
  it('noemt verschillen onder 0,5% gelijk', () => {
    expect(trend(5.0, 5.02, 'run').kind).toBe('flat');
  });

  it('respecteert de richting per discipline', () => {
    expect(trend(5.0, 5.5, 'run').kind).toBe('up'); // sneller lopen = lager tempo
    expect(trend(5.5, 5.0, 'run').kind).toBe('down');
    expect(trend(34, 32, 'fiets').kind).toBe('up'); // harder fietsen = hogere snelheid
    expect(trend(null, 5, 'run').kind).toBe('none');
  });

  it('rapporteert het percentage met een komma', () => {
    expect(trend(4.5, 5.0, 'run').pct).toBe('10,0');
  });
});

/* ================= consistentie & panda ================= */

describe('consistency', () => {
  it('telt afgevinkt van gepland tot vandaag', () => {
    freeze('2026-10-20');
    const s = st(
      { type: 'lange_run', date: '2026-10-01', stats: { done: true } },
      { type: 'lange_run', date: '2026-10-02', stats: { done: true } },
      { type: 'lange_run', date: '2026-10-03', stats: {} },
      { type: 'lange_run', date: '2026-10-04', stats: {} },
      { type: 'lange_run', date: '2026-11-01', stats: {} } // toekomst, telt niet mee
    );
    expect(consistency(s, P)).toBe(50);
  });

  it('geeft null zonder geplande trainingen', () => {
    freeze('2026-10-20');
    expect(consistency(emptyState(), P)).toBeNull();
  });
});

describe('pandaScore', () => {
  it('telt alleen volledig verstreken weken', () => {
    // PANDA_START is maandag 31 augustus 2026. Op zondag 6 september is die
    // week nog niet voorbij: score 0.
    freeze('2026-09-06');
    const s = emptyState();
    s.weekly.tom = { '2026-08-31': { rek: 0, zuipen: 0, geneukt: 1 } };
    expect(pandaScore(s, P)).toBe(0);

    // maandag 7 september: de eerste week is verstreken en telde geneukt > 0
    vi.setSystemTime(new Date('2026-09-07T12:00:00'));
    expect(pandaScore(s, P)).toBe(1);
  });

  it('trekt een punt af voor een lege week', () => {
    freeze('2026-09-21'); // drie weken verstreken
    const s = emptyState();
    s.weekly.tom = { '2026-08-31': { rek: 3, zuipen: 2, geneukt: 1 } };
    // week 1 +1, week 2 −1, week 3 −1
    expect(pandaScore(s, P)).toBe(-1);
  });
});

/* ================= weeknummers ================= */

describe('weekNr', () => {
  it('geeft ISO-weeknummers', () => {
    expect(weekNr(new Date(2026, 0, 1))).toBe(1);
    expect(weekNr(new Date(2027, 3, 12))).toBe(15); // maandag van de raceweek
  });
});

describe('mondayOf', () => {
  it('pakt de maandag, ook op zondag', () => {
    expect(iso(mondayOf('2026-09-06'))).toBe('2026-08-31'); // zondag
    expect(iso(mondayOf('2026-08-31'))).toBe('2026-08-31'); // maandag zelf
    expect(iso(mondayOf('2026-09-02'))).toBe('2026-08-31'); // woensdag
  });
});

/* ================= samenvatting ================= */

describe('summaryText', () => {
  it('schrijft enkelvoud bij één training', () => {
    freeze('2026-10-20');
    const s = st({
      type: 'lange_run',
      date: '2026-10-01',
      stats: { done: true, tijdMin: 55, afstand: 10 }
    });
    const txt = summaryText(s, P, 'Tom', estimateFinish(s, P), consistency(s, P), 0.9);
    expect(txt).toContain('<b>1 training</b>');
    expect(txt).not.toContain('1 trainingen');
  });

  it('schrijft meervoud bij meerdere trainingen', () => {
    freeze('2026-10-20');
    const s = st(
      { type: 'lange_run', date: '2026-10-01', stats: { done: true, tijdMin: 55, afstand: 10 } },
      { type: 'lange_run', date: '2026-10-02', stats: { done: true, tijdMin: 55, afstand: 10 } }
    );
    const txt = summaryText(s, P, 'Tom', estimateFinish(s, P), consistency(s, P), 1.8);
    expect(txt).toContain('<b>2 trainingen</b>');
  });

  it('zegt het netjes als er nog niets is', () => {
    freeze('2026-10-20');
    const s = emptyState();
    expect(summaryText(s, P, 'Tom', estimateFinish(s, P), null, 0)).toBe(
      'Nog geen afgeronde trainingen. Zodra je trainingen afvinkt met tijd en afstand begint hier de analyse: vorm per discipline, trends, en een steeds nauwkeurigere eindtijdvoorspelling.'
    );
  });
});
