import { NextRequest, NextResponse } from 'next/server';
import { db, workouts, weekly, garmin } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type StateShape = {
  version: 2;
  updatedAt: string | null;
  workouts: Record<string, any>;
  weekly: Record<string, Record<string, any>>;
  garmin: Record<string, Record<string, any>>;
};

/** Rijen uit de database terug naar de state-vorm van sectie 5. */
function toState(
  wRows: any[],
  weekRows: any[],
  garminRows: any[]
): StateShape {
  const state: StateShape = {
    version: 2,
    updatedAt: new Date().toISOString(),
    workouts: {},
    weekly: {},
    garmin: {}
  };
  for (const r of wRows) {
    state.workouts[r.id] = {
      id: r.id,
      person: r.person,
      type: r.type,
      date: r.date,
      stats: {
        done: r.done,
        tijdMin: r.tijdMin,
        gemHr: r.gemHr,
        maxHr: r.maxHr,
        afstand: r.afstand,
        snelheid: r.snelheid,
        hoogte: r.hoogte,
        vermogen: r.vermogen,
        rpe: r.rpe
      }
    };
  }
  for (const r of weekRows) {
    (state.weekly[r.person] ||= {})[r.week] = {
      rek: r.rek,
      zuipen: r.zuipen,
      geneukt: r.geneukt
    };
  }
  for (const r of garminRows) {
    (state.garmin[r.person] ||= {})[r.week] = {
      vo2: r.vo2,
      rhr: r.rhr,
      gewicht: r.gewicht
    };
  }
  return state;
}

/** Hele state ophalen. */
export async function GET() {
  try {
    const [wRows, weekRows, garminRows] = await Promise.all([
      db.select().from(workouts),
      db.select().from(weekly),
      db.select().from(garmin)
    ]);
    return NextResponse.json({ data: toState(wRows, weekRows, garminRows) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/**
 * Schrijven. Body:
 *   { workout: {...} }                 -> één training opslaan (upsert)
 *   { deleteWorkout: "<id>" }          -> één training verwijderen
 *   { weekly: {person, week, rek, zuipen, geneukt} }
 *   { garmin: {person, week, vo2, rhr, gewicht} }
 *   { import: <state-object volgens sectie 5> }  -> eenmalige migratie, merge per record
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 });
  }

  try {
    if (body.workout) {
      await upsertWorkout(body.workout);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.deleteWorkout === 'string') {
      await db.delete(workouts).where(eq(workouts.id, body.deleteWorkout));
      return NextResponse.json({ ok: true });
    }
    if (body.weekly) {
      await upsertWeekly(body.weekly);
      return NextResponse.json({ ok: true });
    }
    if (body.garmin) {
      await upsertGarmin(body.garmin);
      return NextResponse.json({ ok: true });
    }
    if (body.import) {
      const n = await importState(body.import);
      return NextResponse.json({ ok: true, ...n });
    }
    return NextResponse.json({ error: 'Niets te doen' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

async function upsertWorkout(w: any) {
  const s = w.stats || {};
  const row = {
    id: String(w.id),
    person: String(w.person),
    type: String(w.type),
    date: String(w.date),
    done: !!s.done,
    tijdMin: num(s.tijdMin),
    gemHr: int(s.gemHr),
    maxHr: int(s.maxHr),
    afstand: num(s.afstand),
    snelheid: num(s.snelheid),
    hoogte: int(s.hoogte),
    vermogen: int(s.vermogen),
    rpe: int(s.rpe),
    updatedAt: new Date()
  };
  await db
    .insert(workouts)
    .values(row)
    .onConflictDoUpdate({ target: workouts.id, set: row });
}

async function upsertWeekly(r: any) {
  const row = {
    person: String(r.person),
    week: String(r.week),
    rek: int(r.rek) ?? 0,
    zuipen: int(r.zuipen) ?? 0,
    geneukt: int(r.geneukt) ?? 0,
    updatedAt: new Date()
  };
  await db
    .insert(weekly)
    .values(row)
    .onConflictDoUpdate({ target: [weekly.person, weekly.week], set: row });
}

async function upsertGarmin(r: any) {
  const row = {
    person: String(r.person),
    week: String(r.week),
    vo2: num(r.vo2),
    rhr: int(r.rhr),
    gewicht: num(r.gewicht),
    updatedAt: new Date()
  };
  await db
    .insert(garmin)
    .values(row)
    .onConflictDoUpdate({ target: [garmin.person, garmin.week], set: row });
}

/** Eenmalige import van een export uit de oude localStorage-versie. */
async function importState(incoming: any) {
  let w = 0;
  let wk = 0;
  let g = 0;
  for (const workout of Object.values<any>(incoming.workouts || {})) {
    await upsertWorkout(workout);
    w++;
  }
  for (const [person, weeks] of Object.entries<any>(incoming.weekly || {})) {
    for (const [week, rec] of Object.entries<any>(weeks || {})) {
      // v1 sloeg deze velden op als booleans; v2 zijn het tellers
      await upsertWeekly({
        person,
        week,
        rek: toCounter(rec.rek),
        zuipen: toCounter(rec.zuipen),
        geneukt: toCounter(rec.geneukt)
      });
      wk++;
    }
  }
  for (const [person, weeks] of Object.entries<any>(incoming.garmin || {})) {
    for (const [week, rec] of Object.entries<any>(weeks || {})) {
      await upsertGarmin({ person, week, ...rec });
      g++;
    }
  }
  return { workouts: w, weekly: wk, garmin: g };
}

const toCounter = (v: any) => (v === true ? 1 : Number(v) || 0);
const num = (v: any) =>
  v === null || v === undefined || v === '' || isNaN(Number(v))
    ? null
    : Number(v);
const int = (v: any) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
