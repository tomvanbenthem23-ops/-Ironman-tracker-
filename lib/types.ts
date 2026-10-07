export type Person = 'tom' | 'quirijn';
export type Discipline = 'run' | 'fiets' | 'zwem' | 'kracht';

/** Soort sessie. Bepaalt hoe een training gelezen en voorgeschreven wordt. */
export type Kind =
  | 'long' // run, altijd zone 2
  | 'easy' // run
  | 'threshold' // run
  | 'interval' // run of fiets
  | 'endurance' // fiets
  | 'tempo' // fiets
  | 'continuous' // zwem
  | 'sets' // zwem
  | 'strength'; // kracht

export type Stats = {
  done?: boolean | null;
  tijdMin?: number | null;
  gemHr?: number | null;
  maxHr?: number | null;
  afstand?: number | null;
  snelheid?: number | null;
  hoogte?: number | null;
  vermogen?: number | null;
  rpe?: number | null;
};

/**
 * Eén blok uit een gestructureerde training, bv. "6 × 800 m @ 4:00/km, rust 1:30".
 * `speed` staat in de eenheid van de discipline: run min/km, zwem min/100m,
 * fiets km/u. `actual` is per herhaling het gerealiseerde tempo in die eenheid.
 */
export type Block = {
  reps: number;
  workDistM?: number | null;
  workDurS?: number | null;
  speed?: number | null;
  watts?: number | null;
  restDurS?: number | null;
  restDistM?: number | null;
  actual?: (number | null)[];
  actualHr?: (number | null)[];
};

export type WindDir = 'tegen' | 'mee' | 'zij' | 'wisselend';

export type Wind = {
  source: 'manual' | 'open-meteo';
  bft?: number | null;
  dir?: WindDir | null;
  speedKmh?: number | null;
  fromDeg?: number | null;
  headKm?: number | null;
  tailKm?: number | null;
  crossKm?: number | null;
  /** Gemiddelde tegenwindcomponent over de rit, km/u (negatief = meewind). */
  headwindKmh?: number | null;
};

export type Workout = {
  id: string;
  person: Person;
  type: string;
  date: string; // YYYY-MM-DD
  stats: Stats;
  kind?: Kind | null;
  structure?: Block[] | null;
  /** Bevroren voorschrift; zolang dit leeg is wordt het live berekend. */
  plan?: unknown;
  wind?: Wind | null;
  source?: 'manual' | 'icu';
  externalId?: string | null;
};

export type WeeklyRec = { rek: number; zuipen: number; geneukt: number };
export type GarminRec = {
  vo2?: number | null;
  rhr?: number | null;
  gewicht?: number | null;
};

export type PersonSettings = {
  z2Low?: number | null;
  z2High?: number | null;
  maxHr?: number | null;
  lthr?: number | null;
  ftp?: number | null;
  /** 'garmin' = uit intervals.icu overgenomen, 'manual' = zelf ingevuld. */
  z2Source?: 'garmin' | 'manual' | null;
  lastSync?: string | null;
};

export type WeekKind = 'build' | 'rest' | 'taper' | 'race';

export type State = {
  version: 2;
  updatedAt: string | null;
  workouts: Record<string, Workout>;
  weekly: Record<string, Record<string, WeeklyRec>>;
  garmin: Record<string, Record<string, GarminRec>>;
  settings: Record<string, PersonSettings>;
  /** Alleen weken die afwijken van het standaardritme. */
  weekFlags: Record<string, WeekKind>;
};

export const emptyState = (): State => ({
  version: 2,
  updatedAt: null,
  workouts: {},
  weekly: {},
  garmin: {},
  settings: {},
  weekFlags: {}
});
