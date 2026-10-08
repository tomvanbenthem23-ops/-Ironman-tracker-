import 'server-only';

import type { Person } from './types';
import type { IcuActivity, IcuInterval, IcuSportSettings, IcuStreams, IcuWellness } from './icu-map';

/**
 * Minimale intervals.icu-client. Per persoon twee env vars, die jullie zelf in
 * Vercel zetten:
 *   ICU_TOM_API_KEY      — intervals.icu → Settings → Developer Settings
 *   ICU_TOM_ATHLETE_ID   — optioneel; standaard "0" (= eigenaar van de sleutel)
 * Quirijn later hetzelfde met ICU_QUIRIJN_*.
 */

const BASE = 'https://intervals.icu/api/v1';

export type IcuCreds = { athleteId: string; key: string };

export function icuCreds(person: Person): IcuCreds | null {
  const P = person.toUpperCase();
  const key = process.env[`ICU_${P}_API_KEY`];
  if (!key) return null;
  return { key, athleteId: process.env[`ICU_${P}_ATHLETE_ID`] || '0' };
}

async function get<T>(creds: IcuCreds, path: string, query: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`API_KEY:${creds.key}`).toString('base64'),
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('intervals.icu weigert de API-sleutel (controleer ICU_*_API_KEY)');
  }
  if (!res.ok) throw new Error(`intervals.icu ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function listActivities(c: IcuCreds, oldest: string, newest: string) {
  return get<IcuActivity[]>(c, `/athlete/${c.athleteId}/activities`, { oldest, newest });
}

export async function getIntervals(c: IcuCreds, activityId: string) {
  const dto = await get<{ icu_intervals?: IcuInterval[] }>(c, `/activity/${activityId}/intervals`);
  return dto.icu_intervals ?? [];
}

/** Tempo- en hartslagverloop van één activiteit (voor runs met alleen auto-laps). */
export async function getStreams(c: IcuCreds, activityId: string): Promise<IcuStreams | null> {
  const list = await get<{ type: string; data: (number | null)[] }[]>(c, `/activity/${activityId}/streams`, {
    types: 'time,distance,heartrate'
  });
  const by = Object.fromEntries((list ?? []).map((s) => [s.type, s.data]));
  if (!by.time?.length || !by.distance?.length) return null;
  return {
    time: by.time as number[],
    distance: by.distance as number[],
    heartrate: by.heartrate ?? null
  };
}

export function listWellness(c: IcuCreds, oldest: string, newest: string) {
  return get<IcuWellness[]>(c, `/athlete/${c.athleteId}/wellness.json`, { oldest, newest });
}

export function sportSettings(c: IcuCreds) {
  return get<IcuSportSettings[]>(c, `/athlete/${c.athleteId}/sport-settings`);
}
