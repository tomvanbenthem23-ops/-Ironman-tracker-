import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  pgTable,
  text,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  timestamp,
  primaryKey
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const db = drizzle(neon(process.env.POSTGRES_URL!));

/**
 * Datamodel — zie sectie 5 van IRONMAN_PROMPT.md.
 * Week-sleutels zijn ALTIJD de ISO-datum van de maandag van die week.
 * Type-sleutels (`type`) verwijzen naar de vaste catalogus uit sectie 6 en
 * mogen nooit hernoemd worden.
 */

export const workouts = pgTable('workouts', {
  id: text('id').primaryKey(),
  person: text('person').notNull(), // 'tom' | 'quirijn'
  type: text('type').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  done: boolean('done').notNull().default(false),
  tijdMin: doublePrecision('tijd_min'),
  gemHr: integer('gem_hr'),
  maxHr: integer('max_hr'),
  afstand: doublePrecision('afstand'), // km, of meters bij zwemmen
  snelheid: doublePrecision('snelheid'),
  hoogte: integer('hoogte'),
  vermogen: integer('vermogen'),
  rpe: integer('rpe'),
  kind: text('kind'),
  structure: jsonb('structure'),
  plan: jsonb('plan'),
  wind: jsonb('wind'),
  indoor: boolean('indoor'),
  source: text('source').notNull().default('manual'),
  externalId: text('external_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const weekly = pgTable(
  'weekly',
  {
    person: text('person').notNull(),
    week: text('week').notNull(), // maandag, YYYY-MM-DD
    rek: integer('rek').notNull().default(0),
    zuipen: integer('zuipen').notNull().default(0),
    geneukt: integer('geneukt').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (t) => ({ pk: primaryKey({ columns: [t.person, t.week] }) })
);

export const garmin = pgTable(
  'garmin',
  {
    person: text('person').notNull(),
    week: text('week').notNull(), // maandag, YYYY-MM-DD
    vo2: doublePrecision('vo2'),
    rhr: integer('rhr'),
    gewicht: doublePrecision('gewicht'),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (t) => ({ pk: primaryKey({ columns: [t.person, t.week] }) })
);

export const personSettings = pgTable('person_settings', {
  person: text('person').primaryKey(),
  z2Low: integer('z2_low'),
  z2High: integer('z2_high'),
  maxHr: integer('max_hr'),
  lthr: integer('lthr'),
  ftp: integer('ftp'),
  ftpSource: text('ftp_source'),
  z2Source: text('z2_source'),
  lastSync: timestamp('last_sync'),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const weekFlags = pgTable('week_flags', {
  week: text('week').primaryKey(), // maandag, YYYY-MM-DD
  kind: text('kind').notNull(), // build | rest | taper | race
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export type SelectWorkout = typeof workouts.$inferSelect;
export type SelectWeekly = typeof weekly.$inferSelect;
export type SelectGarmin = typeof garmin.$inferSelect;
export type SelectPersonSettings = typeof personSettings.$inferSelect;

/**
 * Maakt de tabellen aan en brengt ze op het huidige schema. Idempotent:
 * aanroepen via GET /api/migrate na elke deploy die het schema uitbreidt.
 *
 * Wijzigingen zijn alleen toevoegend — er wordt nooit een kolom verwijderd of
 * omgezet. Vóór de v2-uitbreiding wordt eenmalig een kopie van de bestaande
 * tabellen gemaakt (`*_backup_20261007`).
 */
export async function migrate() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workouts (
      id text PRIMARY KEY,
      person text NOT NULL,
      type text NOT NULL,
      date text NOT NULL,
      done boolean NOT NULL DEFAULT false,
      tijd_min double precision,
      gem_hr integer,
      max_hr integer,
      afstand double precision,
      snelheid double precision,
      hoogte integer,
      vermogen integer,
      rpe integer,
      updated_at timestamp NOT NULL DEFAULT now()
    )`);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS workouts_person_date_idx ON workouts (person, date)`
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS weekly (
      person text NOT NULL,
      week text NOT NULL,
      rek integer NOT NULL DEFAULT 0,
      zuipen integer NOT NULL DEFAULT 0,
      geneukt integer NOT NULL DEFAULT 0,
      updated_at timestamp NOT NULL DEFAULT now(),
      PRIMARY KEY (person, week)
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS garmin (
      person text NOT NULL,
      week text NOT NULL,
      vo2 double precision,
      rhr integer,
      gewicht double precision,
      updated_at timestamp NOT NULL DEFAULT now(),
      PRIMARY KEY (person, week)
    )`);

  /* ---------- v2: kopie van de data vóór de uitbreiding ---------- */
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS workouts_backup_20261007 AS TABLE workouts`
  );
  await db.execute(sql`CREATE TABLE IF NOT EXISTS weekly_backup_20261007 AS TABLE weekly`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS garmin_backup_20261007 AS TABLE garmin`);

  /* ---------- v2: nieuwe kolommen en tabellen ---------- */
  await db.execute(sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS kind text`);
  await db.execute(sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS structure jsonb`);
  await db.execute(sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS plan jsonb`);
  await db.execute(sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS wind jsonb`);
  await db.execute(
    sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`
  );
  await db.execute(sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS external_id text`);
  await db.execute(sql`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS indoor boolean`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS workouts_external_id_idx
      ON workouts (external_id) WHERE external_id IS NOT NULL`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS person_settings (
      person text PRIMARY KEY,
      z2_low integer,
      z2_high integer,
      max_hr integer,
      lthr integer,
      ftp integer,
      ftp_source text,
      z2_source text,
      last_sync timestamp,
      updated_at timestamp NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`ALTER TABLE person_settings ADD COLUMN IF NOT EXISTS ftp_source text`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS week_flags (
      week text PRIMARY KEY,
      kind text NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )`);
}

/** Tellingen voor de controle na een migratie. */
export async function counts() {
  const rows = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM workouts)::int AS workouts,
      (SELECT count(*) FROM workouts_backup_20261007)::int AS workouts_backup,
      (SELECT count(*) FROM weekly)::int AS weekly,
      (SELECT count(*) FROM garmin)::int AS garmin`);
  return (rows as any).rows?.[0] ?? (rows as any)[0];
}
