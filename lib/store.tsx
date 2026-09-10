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
import { emptyState, type GarminRec, type Person, type State, type Stats, type Workout } from './types';
import { uid, weekKeyOf } from './calc';

/**
 * Gedeelde data-laag. Alles gaat naar de server (sectie 2): wat Tom op zijn
 * telefoon invult, ziet Quirijn op zijn laptop. Schrijven gaat optimistisch —
 * je eigen wijziging staat meteen op het scherm — en mislukt een schrijfactie,
 * dan blijft hij zichtbaar én in de wachtrij staan in plaats van stil te
 * verdwijnen.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'loaded' | 'error';

type PendingWrite = { id: string; body: any };

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
  saveWorkout: (id: string, patch: { date?: string; stats?: Stats }) => void;
  deleteWorkout: (id: string) => void;
  bumpWeekly: (field: 'rek' | 'zuipen' | 'geneukt', weekKey: string, delta: number) => void;
  saveGarmin: (weekKey: string, rec: GarminRec) => void;
  importJson: (raw: unknown) => Promise<{ ok: boolean; message: string }>;
  retry: () => void;
  refresh: () => void;
};

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
        setState(normalize(body.data));
        setReady(true);
        if (!silent) setSaveState('loaded');
      } catch {
        setReady(true);
        if (!silent) setSaveState('error');
      }
    },
    []
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) {
        queue.current = JSON.parse(raw);
        setPending(queue.current.length);
      }
    } catch {}
    void load().then(() => flush());
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
    (id: string, patch: { date?: string; stats?: Stats }) => {
      setState((s) => {
        const prev = s.workouts[id];
        if (!prev) return s;
        const next: Workout = {
          ...prev,
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

  const importJson = useCallback(
    async (raw: unknown) => {
      const incoming = raw as any;
      if (!incoming || typeof incoming !== 'object' || !incoming.workouts) {
        return { ok: false, message: 'Dat lijkt geen geldig databestand.' };
      }
      setSaveState('saving');
      try {
        const res = await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import: incoming })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || String(res.status));
        await load(true);
        setSaveState('saved');
        return {
          ok: true,
          message: `Ingelezen: ${body.workouts} trainingen, ${body.weekly} weken, ${body.garmin} Garmin-records.`
        };
      } catch (e) {
        setSaveState('error');
        return {
          ok: false,
          message: 'Import mislukt: ' + (e instanceof Error ? e.message : String(e))
        };
      }
    },
    [load]
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
      importJson,
      retry: () => void flush(),
      refresh: () => void load()
    }),
    [
      state, ready, saveState, pending, person, setPerson,
      addWorkout, saveWorkout, deleteWorkout, bumpWeekly, saveGarmin, importJson, flush, load
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore buiten StoreProvider');
  return ctx;
}

/** v1 sloeg de weektellers op als booleans; v2 zijn het tellers. */
function normalize(raw: any): State {
  const s: State = { ...emptyState(), ...(raw || {}) };
  s.workouts = s.workouts || {};
  s.weekly = s.weekly || {};
  s.garmin = s.garmin || {};
  for (const p of Object.keys(s.weekly)) {
    for (const wk of Object.keys(s.weekly[p])) {
      const r: any = s.weekly[p][wk];
      for (const f of ['rek', 'zuipen', 'geneukt'] as const) {
        r[f] = r[f] === true ? 1 : Number(r[f]) || 0;
      }
    }
  }
  for (const id of Object.keys(s.workouts)) {
    s.workouts[id].stats = s.workouts[id].stats || {};
  }
  return s;
}

export { weekKeyOf };
