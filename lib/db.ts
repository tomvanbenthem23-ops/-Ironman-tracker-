import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  pgTable,
  text,
  boolean,
  doublePrecision,
  integer,
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

export type SelectWorkout = typeof workouts.$inferSelect;
export type SelectWeekly = typeof weekly.$inferSelect;
export type SelectGarmin = typeof garmin.$inferSelect;

/**
 * Maakt de tabellen aan als ze nog niet bestaan.
 * Eenmalig aanroepen via GET /api/migrate na de eerste deploy.
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
}
