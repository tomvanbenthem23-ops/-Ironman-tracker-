import type { Discipline, Person } from './types';

/**
 * Vaste configuratie — sectie 6 van IRONMAN_PROMPT.md.
 * Dit is géén gebruikersdata: de sleutels hieronder staan in de database bij
 * elke training en mogen daarom nooit hernoemd worden.
 */

export const NAMES: Record<Person, string> = { tom: 'Tom', quirijn: 'Quirijn' };
export const PERSONS: Person[] = ['tom', 'quirijn'];

export type TrainingType = {
  label: string;
  sub: string;
  cat: Discipline;
  phase: 1 | 2;
  color: string;
  border: string;
  goal: number | null;
};

export const TYPES: Record<string, TrainingType> = {
  lange_run:    { label: 'Lange run',        sub: '40–75 min',             cat: 'run',    phase: 1, color: '#d5e8d4', border: '#82b366', goal: 5.25 },
  korte_run:    { label: 'Korte run',        sub: 'interval / hoog tempo', cat: 'run',    phase: 1, color: '#d5e8d4', border: '#82b366', goal: 4.667 },
  lange_fiets:  { label: 'Lange fiets',      sub: '90–120 min',            cat: 'fiets',  phase: 1, color: '#ffe6cc', border: '#d79b00', goal: 33 },
  korte_fiets:  { label: 'Korte fiets',      sub: '± 30 km',               cat: 'fiets',  phase: 1, color: '#ffe6cc', border: '#d79b00', goal: 35 },
  zwem:         { label: 'Zwemtraining',     sub: '',                      cat: 'zwem',   phase: 1, color: '#dae8fc', border: '#6c8ebf', goal: 2.0 },
  core:         { label: 'Core / benen',     sub: 'stability',             cat: 'kracht', phase: 1, color: '#f8cecc', border: '#b85450', goal: null },
  upper:        { label: 'Upper body',       sub: '',                      cat: 'kracht', phase: 1, color: '#f8cecc', border: '#b85450', goal: null },

  long_run:     { label: 'Long run',         sub: '75–100 min duur',       cat: 'run',    phase: 2, color: '#ea9999', border: '#b3423c', goal: 5.25 },
  interval_run: { label: 'Interval run',     sub: 'hoog tempo',            cat: 'run',    phase: 2, color: '#ea9999', border: '#b3423c', goal: 4.667 },
  easy_run:     { label: 'Easy run',         sub: 'rustig / herstel',      cat: 'run',    phase: 2, color: '#ea9999', border: '#b3423c', goal: 5.75 },
  bike60:       { label: '60 min bike ride', sub: '',                      cat: 'fiets',  phase: 2, color: '#ffe599', border: '#bf9000', goal: 35 },
  bike90:       { label: '90–120 min bike',  sub: '',                      cat: 'fiets',  phase: 2, color: '#ffe599', border: '#bf9000', goal: 33 },
  bike150:      { label: '150 min bike ride',sub: '',                      cat: 'fiets',  phase: 2, color: '#ffe599', border: '#bf9000', goal: 31 },
  swim2000:     { label: 'Swim 1 — 2000m',   sub: '',                      cat: 'zwem',   phase: 2, color: '#9fc5e8', border: '#3d85c6', goal: 2.0 },
  swim_int:     { label: 'Swim 2 — interval',sub: '',                      cat: 'zwem',   phase: 2, color: '#9fc5e8', border: '#3d85c6', goal: 1.917 },
  legs_core:    { label: 'Legs + core',      sub: '',                      cat: 'kracht', phase: 2, color: '#b6d7a8', border: '#6aa84f', goal: null },
  upper_body:   { label: 'Upper body session',sub: '',                     cat: 'kracht', phase: 2, color: '#b6d7a8', border: '#6aa84f', goal: null },
  full_body:    { label: 'Full body session',sub: '',                      cat: 'kracht', phase: 2, color: '#b6d7a8', border: '#6aa84f', goal: null }
};

/** Referentiedoel per discipline — schaalt baselines van fase-2-types. */
export const DISC_REF: Record<'run' | 'fiets' | 'zwem', number> = {
  run: 5.25,
  fiets: 33,
  zwem: 2.0
};

/** Lager tempo is beter (run, zwem) vs. hogere snelheid is beter (fiets). */
export const BETTER: Record<'run' | 'fiets' | 'zwem', 'low' | 'high'> = {
  run: 'low',
  fiets: 'high',
  zwem: 'low'
};

export const RACE = new Date(2027, 3, 18, 8, 0, 0);
export const RACE_DATE = '2027-04-18';
export const GOAL_MIN = 300; // sub-5 uur

/** [jaar, maandindex] — precies acht maanden, navigatie klemt hierop. */
export const MONTHS: [number, number][] = [
  [2026, 8], [2026, 9], [2026, 10], [2026, 11],
  [2027, 0], [2027, 1], [2027, 2], [2027, 3]
];

export const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];
export const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

export const TARGET_FROM = new Date(2026, 9, 1);  // geen targets ervoor
export const T0 = new Date(2026, 9, 5);           // start van de targetopbouw
export const T1 = new Date(2027, 3, 12);          // maandag van de raceweek
export const PHASE2_FROM = new Date(2027, 0, 1);  // palet schakelt om
export const PANDA_START = new Date(2026, 7, 31); // eerste week die telt

export const SEPT_FROM = '2026-09-01';
export const SEPT_TO = '2026-09-30';

export const DISCIPLINES: {
  cat: 'run' | 'fiets' | 'zwem';
  emoji: string;
  naam: string;
  color: string;
}[] = [
  { cat: 'run', emoji: '🏃', naam: 'Lopen', color: '#b3423c' },
  { cat: 'fiets', emoji: '🚴', naam: 'Fietsen', color: '#bf9000' },
  { cat: 'zwem', emoji: '🏊', naam: 'Zwemmen', color: '#3d85c6' }
];
