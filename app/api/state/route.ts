import { NextRequest, NextResponse } from 'next/server';
import { db, workouts, weekly, garmin, personSettings, weekFlags } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { rowToWorkout, workoutToRow } from '@/lib/rows';
import { icuCreds } from '@/lib/icu';
import { PERSONS } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1'; // Frankfurt: naast de Neon-database

/** Hele state ophalen, in de vorm van sectie 5 van de spec. */
export async function GET() {
  try {
    const [wRows, weekRows, garminRows, settingRows, flagRows] = await Promise.all([
      db.select().from(workouts),
      db.select().from(weekly),
      db.select().from(garmin),
      db.select().from(personSettings),
      db.select().from(weekFlags)
    ]);

    const state: any = {
      version: 2,
      updatedAt: new Date().toISOString(),
      workouts: {},
      weekly: {},
      garmin: {},
      settings: {},
      weekFlags: {},
      // wie een intervals.icu-koppeling heeft (alleen ja/nee, nooit de sleutel)
      integrations: Object.fromEntries(PERSONS.map((p) => [p, !!icuCreds(p)]))
    };
    for (const r of wRows) state.workouts[r.id] = rowToWorkout(r);
    for (const r of weekRows) {
      (state.weekly[r.person] ||= {})[r.week] = {
        rek: r.rek,
        zuipen: r.zuipen,
        geneukt: r.geneukt
      };
    }
    for (const r of garminRows) {
      (state.garmin[r.person] ||= {})[r.week] = { vo2: r.vo2, rhr: r.rhr, gewicht: r.gewicht };
    }
    for (const r of settingRows) {
      state.settings[r.person] = {
        z2Low: r.z2Low,
        z2High: r.z2High,
        maxHr: r.maxHr,
        lthr: r.lthr,
        ftp: r.ftp,
        ftpSource: r.ftpSource,
        z2Source: r.z2Source,
        lastSync: r.lastSync ? r.lastSync.toISOString() : null
      };
    }
    for (const r of flagRows) state.weekFlags[r.week] = r.kind;

    return NextResponse.json({ data: state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/**
 * Schrijven. Body:
 *   { workout: {...} }                   -> één training opslaan (upsert)
 *   { deleteWorkout: "<id>" }            -> één training verwijderen
 *   { weekly: {person, week, rek, zuipen, geneukt} }
 *   { garmin: {person, week, vo2, rhr, gewicht} }
 *   { settings: {person, z2Low, z2High, maxHr, ftp} }   -> handmatige instellingen
 *   { weekFlag: {week, kind | null} }    -> week omzetten; null = terug naar standaard
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 });
  }

  try {
    if (body.workout) {
      const row = workoutToRow(body.workout);
      await db.insert(workouts).values(row).onConflictDoUpdate({ target: workouts.id, set: row });
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
    if (body.settings) {
      await upsertSettings(body.settings);
      return NextResponse.json({ ok: true });
    }
    if (body.weekFlag && typeof body.weekFlag.week === 'string') {
      const { week, kind } = body.weekFlag;
      if (kind === null) {
        await db.delete(weekFlags).where(eq(weekFlags.week, week));
      } else if (['build', 'rest', 'taper', 'race'].includes(kind)) {
        const row = { week, kind, updatedAt: new Date() };
        await db.insert(weekFlags).values(row).onConflictDoUpdate({ target: weekFlags.week, set: row });
      } else {
        return NextResponse.json({ error: 'Onbekend weektype' }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Niets te doen' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
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

/** Handmatige instellingen. Zone 2 met de hand = bron 'manual'; sync blijft daar dan van af. */
async function upsertSettings(r: any) {
  const person = String(r.person);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ('z2Low' in r || 'z2High' in r) {
    set.z2Low = int(r.z2Low);
    set.z2High = int(r.z2High);
    set.z2Source = set.z2Low == null && set.z2High == null ? null : 'manual';
  }
  if ('maxHr' in r) set.maxHr = int(r.maxHr);
  if ('ftp' in r) {
    set.ftp = int(r.ftp);
    // zelf ingevuld gaat voor de schatting uit je vermogensdata; leeg = weer automatisch
    set.ftpSource = set.ftp == null ? null : 'manual';
  }
  await db
    .insert(personSettings)
    .values({ person, ...set })
    .onConflictDoUpdate({ target: personSettings.person, set });
}

const num = (v: any) =>
  v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v);
const int = (v: any) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
