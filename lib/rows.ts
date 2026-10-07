import type { SelectWorkout } from './db';

/**
 * Vertaling tussen een databaserij en een Workout zoals de client hem kent.
 * Gedeeld door /api/state en de Garmin-sync, zodat beide precies hetzelfde
 * wegschrijven.
 */

export function rowToWorkout(r: SelectWorkout) {
  return {
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
    },
    kind: r.kind ?? null,
    structure: r.structure ?? null,
    plan: r.plan ?? null,
    wind: r.wind ?? null,
    indoor: r.indoor ?? null,
    source: r.source === 'icu' ? 'icu' : 'manual',
    externalId: r.externalId ?? null
  };
}

export function workoutToRow(w: any) {
  const s = w.stats || {};
  return {
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
    kind: typeof w.kind === 'string' ? w.kind : null,
    structure: Array.isArray(w.structure) && w.structure.length ? w.structure : null,
    plan: w.plan ?? null,
    wind: w.wind ?? null,
    indoor: typeof w.indoor === 'boolean' ? w.indoor : null,
    source: w.source === 'icu' ? 'icu' : 'manual',
    externalId: w.externalId ? String(w.externalId) : null,
    updatedAt: new Date()
  };
}

const num = (v: any) =>
  v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v);
const int = (v: any) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
