import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, garmin, personSettings, workouts } from '@/lib/db';
import { rowToWorkout, workoutToRow } from '@/lib/rows';
import { getIntervals, getStreams, icuCreds, listActivities, listWellness, sportSettings } from '@/lib/icu';
import {
  disciplineOf,
  intervalsToStructure,
  matchActivities,
  wellnessToWeeks,
  zonesFromSettings,
  estimatedFtp,
  type IcuInterval,
  type IcuStreams
} from '@/lib/icu-map';
import { PERSONS, TYPES } from '@/lib/config';
import { addDays, iso, robustMax } from '@/lib/calc';
import type { GarminRec, Person, Workout } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';
export const maxDuration = 60;

const FIRST_SYNC_FROM = '2026-09-01';

/**
 * Haalt Garmin-data op via intervals.icu en zet die in de tracker.
 *   POST /api/sync            → iedereen met een sleutel
 *   POST /api/sync?person=tom → alleen Tom
 *   GET  /api/sync            → idem; zo roept de dagelijkse Vercel Cron hem aan
 */
export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const only = req.nextUrl.searchParams.get('person');
  // ?rebuild=1: alles vanaf 1 september opnieuw, inclusief intervallen van al
  // gesynchroniseerde trainingen — nodig als de omzetregels veranderd zijn
  const rebuild = req.nextUrl.searchParams.get('rebuild') === '1';
  const people = PERSONS.filter((p) => (!only || p === only) && icuCreds(p));
  if (!people.length) {
    return NextResponse.json({ ok: true, results: [], message: 'Geen intervals.icu-koppeling ingesteld.' });
  }

  const results = [];
  for (const person of people) {
    try {
      results.push({ person, ok: true, ...(await syncPerson(person, rebuild)) });
    } catch (e) {
      results.push({ person, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 502 });
}

async function syncPerson(person: Person, rebuild = false) {
  const creds = icuCreds(person)!;
  const today = iso(new Date());

  const [settingRow] = await db.select().from(personSettings).where(eq(personSettings.person, person));
  // drie dagen overlap: Garmin synct soms pas later door
  const oldest =
    settingRow?.lastSync && !rebuild
      ? iso(addDays(settingRow.lastSync, -3))
      : FIRST_SYNC_FROM;

  /* ---------- activiteiten ---------- */
  const existing: Workout[] = (
    await db.select().from(workouts).where(eq(workouts.person, person))
  ).map((r) => rowToWorkout(r) as Workout);
  const known = new Set(existing.map((w) => w.externalId).filter(Boolean));

  const acts = (await listActivities(creds, oldest, today)).filter(
    (a) => a.source !== 'STRAVA' && disciplineOf(a.type)
  );

  // intervallen alleen ophalen voor nieuwe activiteiten (bij rebuild: alle); max 4 tegelijk
  const intervals = new Map<string, IcuInterval[] | null>();
  const todo = rebuild ? acts : acts.filter((a) => !known.has(String(a.id)));
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (a) => {
        intervals.set(String(a.id), await getIntervals(creds, String(a.id)).catch(() => null));
      })
    );
  }

  // runs met alleen auto-laps: ook het tempoverloop, om de blokken daaruit te halen
  const streams = new Map<string, IcuStreams | null>();
  const needStreams = todo.filter((a) => {
    const iv = intervals.get(String(a.id));
    return disciplineOf(a.type) === 'run' && !(iv && intervalsToStructure(iv, 'run', a.moving_time));
  });
  for (let i = 0; i < needStreams.length; i += 4) {
    await Promise.all(
      needStreams.slice(i, i + 4).map(async (a) => {
        streams.set(String(a.id), await getStreams(creds, String(a.id)).catch(() => null));
      })
    );
  }

  const res = matchActivities(
    person,
    existing,
    acts.map((act) => ({
      act,
      intervals: intervals.get(String(act.id)) ?? null,
      streams: streams.get(String(act.id)) ?? null
    }))
  );
  for (const w of res.upserts) {
    const row = workoutToRow(w);
    await db.insert(workouts).values(row).onConflictDoUpdate({ target: workouts.id, set: row });
  }

  /* ---------- wellness: VO2max, rusthartslag, gewicht ---------- */
  const gRows = await db.select().from(garmin).where(eq(garmin.person, person));
  const current: Record<string, GarminRec> = Object.fromEntries(
    gRows.map((r) => [r.week, { vo2: r.vo2, rhr: r.rhr, gewicht: r.gewicht }])
  );
  const weeks = wellnessToWeeks(
    await listWellness(creds, iso(addDays(new Date(oldest), -7)), today),
    current
  );
  for (const [week, rec] of Object.entries(weeks)) {
    const row = {
      person,
      week,
      vo2: rec.vo2 ?? null,
      rhr: rec.rhr ?? null,
      gewicht: rec.gewicht ?? null,
      updatedAt: new Date()
    };
    await db
      .insert(garmin)
      .values(row)
      .onConflictDoUpdate({ target: [garmin.person, garmin.week], set: row });
  }

  /* ---------- zones: niet over een handmatige zone 2 heen ---------- */
  // per training één keer: de bijgewerkte versie vervangt de oude (anders telt
  // één hartslagpiek dubbel en lijkt een standaard-max van 220 geloofwaardig)
  const byId = new Map(existing.map((w) => [w.id, w]));
  for (const w of res.upserts) byId.set(w.id, w);
  const all = Array.from(byId.values());
  const observedMax = robustMax(
    all.filter((w) => TYPES[w.type]?.cat === 'run' && w.stats?.maxHr).map((w) => w.stats.maxHr!)
  );
  const zones = zonesFromSettings(await sportSettings(creds).catch(() => []), observedMax);
  // FTP uit je eigen vermogensdata (hometrainer of wattmeter), niet de standaard van het account
  const eftp = estimatedFtp(acts);

  const set: Record<string, unknown> = { lastSync: new Date(), updatedAt: new Date() };
  if (settingRow?.z2Source !== 'manual') {
    if (zones.z2High) {
      set.z2Low = zones.z2Low;
      set.z2High = zones.z2High;
      set.z2Source = 'garmin';
    } else if (settingRow?.z2Source === 'garmin') {
      // eerder overgenomen standaardzones van intervals.icu weer weghalen
      set.z2Low = null;
      set.z2High = null;
      set.z2Source = null;
    }
  }
  if (zones.lthr) set.lthr = zones.lthr;
  else if (settingRow?.lthr && settingRow.lthr === zones.raw.lthr) set.lthr = null;
  if (zones.maxHr && !settingRow?.maxHr) set.maxHr = zones.maxHr;
  else if (!zones.hrValid && settingRow?.maxHr && settingRow.maxHr === zones.raw.maxHr) set.maxHr = null;
  if (settingRow?.ftpSource !== 'manual') {
    if (eftp) {
      set.ftp = eftp;
      set.ftpSource = 'garmin';
    } else if (!settingRow?.ftpSource && settingRow?.ftp && settingRow.ftp === zones.raw.ftp) {
      set.ftp = null; // eerder overgenomen standaard-FTP
    }
  }
  await db
    .insert(personSettings)
    .values({ person, ...set })
    .onConflictDoUpdate({ target: personSettings.person, set });

  return {
    from: oldest,
    activities: acts.length,
    created: res.created,
    matched: res.matched,
    updated: res.updated,
    wellnessWeeks: Object.keys(weeks).length,
    z2: set.z2High ? `${set.z2Low}–${set.z2High}` : null
  };
}
