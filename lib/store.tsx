'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  emptyState,
  type GarminRec,
  type Person,
  type PersonSettings,
  type State,
  type WeekKind,
  type Workout
} from './types';
import { uid, weekKeyOf } from './calc';

/**
 * Gedeelde data-laag. Alles gaat naar de server (sectie 2): wat Tom invult,
 * ziet Quirijn op zijn eigen laptop. Schrijven gaat optimistisch —
 * je eigen wijziging staat meteen op het scherm — en mislukt een schrijfactie,
 * dan blijft hij zichtbaar én in de wachtrij staan in plaats van stil te
 * verdwijnen.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'loaded' | 'error';

type PendingWrite = { id: string; body: any };

export type WorkoutPatch = Partial<
  Pick<Workout, 'date' | 'stats' | 'kind' | 'structure' | 'wind' | 'plan' | 'indoor'>
>;

type Ctx = {
  state: State;
  ready: boolean;
  saveState: SaveState;
  pending: number;
  person: Person;
  setPerson: (p: Person) => void;
  /** Zolang dit aan staat overschrijft een achtergrondrefresh niets. */
  setEditing: (v: boolean) => void;
  addWorkout: (type: string, date: string, person?: Person) => string;
  saveWorkout: (id: string, patch: WorkoutPatch) => void;
  deleteWorkout: (id: string) => void;
  bumpWeekly: (field: 'rek' | 'zuipen' | 'geneukt', weekKey: string, delta: number) => void;
  saveGarmin: (weekKey: string, rec: GarminRec) => void;
  saveSettings: (patch: Partial<PersonSettings>) => void;
  setWeekFlag: (weekKey: string, kind: WeekKind | null) => void;
  retry: () => void;
  refresh: () => void;
  syncState: SyncState;
  syncGarmin: () => void;
};

export type SyncState = { status: 'idle' | 'syncing' | 'ok' | 'error'; message: string };

const StoreContext = createContext<Ctx | null>(null);
const PENDING_KEY = 'im_pending_v1';
const PERSON_KEY = 'im_person';
const POLL_MS = 45000;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(emptyState);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [person, setPersonRaw] = useState<Person>('tom');
  const [pending, setPending] = useState(0);

  const queue = useRef<PendingWrite[]>([]);
  const editing = useRef(false);
  const flushing = useRef(false);

  /* ---------- persoonkeuze onthouden (per apparaat) ---------- */
  useEffect(() => {
    try {
      const p = localStorage.getItem(PERSON_KEY);
      if (p === 'tom' || p === 'quirijn') setPersonRaw(p);
    } catch {}
  }, []);

  const setPerson = useCallback((p: Person) => {
    setPersonRaw(p);
    try {
      localStorage.setItem(PERSON_KEY, p);
    } catch {}
  }, []);

  /* ---------- wachtrij bewaren zodat niets stil verdwijnt ---------- */
  const persistQueue = useCallback(() => {
    setPending(queue.current.length);
    try {
      if (queue.current.length) {
        localStorage.setItem(PENDING_KEY, JSON.stringify(queue.current));
      } else {
        localStorage.removeItem(PENDING_KEY);
      }
    } catch {}
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length) return;
    flushing.current = true;
    setSaveState('saving');
    try {
      while (queue.current.length) {
        const item = queue.current[0];
        const res = await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body)
        });
        if (!res.ok) throw new Error(String(res.status));
        queue.current.shift();
        persistQueue();
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
      persistQueue();
    } finally {
      flushing.current = false;
    }
  }, [persistQueue]);

  const push = useCallback(
    (body: any) => {
      queue.current.push({ id: uid(), body });
      persistQueue();
      void flush();
    },
    [flush, persistQueue]
  );

  /* ---------- laden ---------- */
  const load = useCallback(
    async (silent = false) => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const next = normalize(body.data);
        setState(next);
        setReady(true);
        if (!silent) setSaveState('loaded');
        return next;
      } catch {
        setReady(true);
        if (!silent) setSaveState('error');
        return null;
      }
    },
    []
  );

  /* ---------- Garmin via intervals.icu ---------- */
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle', message: '' });

  const syncGarmin = useCallback(async () => {
    setSyncState({ status: 'syncing', message: 'Garmin ophalen…' });
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json();
      const failed = (body.results ?? []).find((r: any) => !r.ok);
      if (failed) throw new Error(failed.error);
      const n = (body.results ?? []).reduce(
        (a: number, r: any) => a + (r.created ?? 0) + (r.matched ?? 0),
        0
      );
      setSyncState({
        status: 'ok',
        message: n ? `⌚ ${n} nieuwe training${n === 1 ? '' : 'en'}` : '⌚ bijgewerkt'
      });
      if (!editing.current) await load(true);
    } catch (e) {
      setSyncState({
        status: 'error',
        message: '⚠️ Garmin: ' + (e instanceof Error ? e.message : 'mislukt')
      });
    }
  }, [load]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) {
        queue.current = JSON.parse(raw);
        setPending(queue.current.length);
      }
    } catch {}
    void load().then((s) => {
      void flush();
      if (s && needsSync(s)) void syncGarmin();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- periodiek verversen, maar nooit over een open formulier heen ---------- */
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      if (editing.current) return;
      if (queue.current.length) return; // eerst onze eigen schrijfacties kwijt
      void load(true);
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  /* ---------- mutaties ---------- */

  const addWorkout = useCallback(
    (type: string, date: string, who?: Person) => {
      const id = uid();
      const w: Workout = { id, person: who ?? person, type, date, stats: {} };
      setState((s) => ({ ...s, workouts: { ...s.workouts, [id]: w } }));
      push({ workout: w });
      return id;
    },
    [person, push]
  );

  const saveWorkout = useCallback(
    (id: string, patch: WorkoutPatch) => {
      setState((s) => {
        const prev = s.workouts[id];
        if (!prev) return s;
        const next: Workout = {
          ...prev,
          ...patch,
          date: patch.date ?? prev.date,
          stats: patch.stats ? { ...patch.stats } : prev.stats
        };
        push({ workout: next });
        return { ...s, workouts: { ...s.workouts, [id]: next } };
      });
    },
    [push]
  );

  const deleteWorkout = useCallback(
    (id: string) => {
      setState((s) => {
        const next = { ...s.workouts };
        delete next[id];
        return { ...s, workouts: next };
      });
      push({ deleteWorkout: id });
    },
    [push]
  );

  const bumpWeekly = useCallback(
    (field: 'rek' | 'zuipen' | 'geneukt', weekKey: string, delta: number) => {
      setState((s) => {
        const cur = s.weekly[person]?.[weekKey] ?? { rek: 0, zuipen: 0, geneukt: 0 };
        const rec = { ...cur, [field]: Math.max(0, (cur[field] || 0) + delta) };
        push({ weekly: { person, week: weekKey, ...rec } });
        return {
          ...s,
          weekly: { ...s.weekly, [person]: { ...(s.weekly[person] ?? {}), [weekKey]: rec } }
        };
      });
    },
    [person, push]
  );

  const saveGarmin = useCallback(
    (weekKey: string, rec: GarminRec) => {
      setState((s) => ({
        ...s,
        garmin: { ...s.garmin, [person]: { ...(s.garmin[person] ?? {}), [weekKey]: rec } }
      }));
      push({ garmin: { person, week: weekKey, ...rec } });
    },
    [person, push]
  );

  const saveSettings = useCallback(
    (patch: Partial<PersonSettings>) => {
      setState((s) => {
        const cur = s.settings[person] ?? {};
        const next: PersonSettings = { ...cur, ...patch };
        if ('ftp' in patch) next.ftpSource = patch.ftp == null ? null : 'manual';
        if ('z2Low' in patch || 'z2High' in patch) {
          next.z2Source = next.z2Low == null && next.z2High == null ? null : 'manual';
        }
        return { ...s, settings: { ...s.settings, [person]: next } };
      });
      push({ settings: { person, ...patch } });
    },
    [person, push]
  );

  /** Weektype geldt voor jullie allebei: jullie trainen hetzelfde schema. */
  const setWeekFlag = useCallback(
    (weekKey: string, kind: WeekKind | null) => {
      setState((s) => {
        const flags = { ...s.weekFlags };
        if (kind) flags[weekKey] = kind;
        else delete flags[weekKey];
        return { ...s, weekFlags: flags };
      });
      push({ weekFlag: { week: weekKey, kind } });
    },
    [push]
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      ready,
      saveState,
      pending,
      person,
      setPerson,
      setEditing: (v: boolean) => {
        editing.current = v;
      },
      addWorkout,
      saveWorkout,
      deleteWorkout,
      bumpWeekly,
      saveGarmin,
      saveSettings,
      setWeekFlag,
      retry: () => void flush(),
      refresh: () => void load(),
      syncState,
      syncGarmin: () => void syncGarmin()
    }),
    [
      state, ready, saveState, pending, person, setPerson,
      addWorkout, saveWorkout, deleteWorkout, bumpWeekly, saveGarmin, saveSettings, setWeekFlag, flush, load, syncState, syncGarmin
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore buiten StoreProvider');
  return ctx;
}

/** Vult ontbrekende sleutels aan zodat de rest van de app niets hoeft te checken. */
function normalize(raw: any): State {
  const s: State = { ...emptyState(), ...(raw || {}) };
  s.workouts = s.workouts || {};
  s.weekly = s.weekly || {};
  s.garmin = s.garmin || {};
  s.settings = s.settings || {};
  s.weekFlags = s.weekFlags || {};
  s.integrations = s.integrations || {};
  for (const id of Object.keys(s.workouts)) {
    s.workouts[id].stats = s.workouts[id].stats || {};
  }
  return s;
}

export { weekKeyOf };

const SYNC_EVERY_MS = 15 * 60 * 1000;

/** Iemand gekoppeld en diens laatste sync is ouder dan een kwartier? */
function needsSync(s: State) {
  return Object.entries(s.integrations).some(([p, on]) => {
    if (!on) return false;
    const last = s.settings[p]?.lastSync;
    return !last || Date.now() - new Date(last).getTime() > SYNC_EVERY_MS;
  });
}
