export type Person = 'tom' | 'quirijn';
export type Discipline = 'run' | 'fiets' | 'zwem' | 'kracht';

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

export type Workout = {
  id: string;
  person: Person;
  type: string;
  date: string; // YYYY-MM-DD
  stats: Stats;
};

export type WeeklyRec = { rek: number; zuipen: number; geneukt: number };
export type GarminRec = {
  vo2?: number | null;
  rhr?: number | null;
  gewicht?: number | null;
};

export type State = {
  version: 2;
  updatedAt: string | null;
  workouts: Record<string, Workout>;
  weekly: Record<string, Record<string, WeeklyRec>>;
  garmin: Record<string, Record<string, GarminRec>>;
};

export const emptyState = (): State => ({
  version: 2,
  updatedAt: null,
  workouts: {},
  weekly: {},
  garmin: {}
});
