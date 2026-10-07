import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  consistency,
  derivedSpeed,
  fmtHM,
  fmtPace,
  fmtTijd,
  iso,
  mondayOf,
  pandaScore,
  parseSpeed,
  parseTijd,
  trend,
  weekNr
} from './calc';
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
