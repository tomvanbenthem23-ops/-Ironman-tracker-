'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { MONTHS, MONTH_NAMES, NAMES, PERSONS, TYPES } from '@/lib/config';
import { derivedSpeed, fmtKmh, fmtPace, pad } from '@/lib/calc';
import { useStore } from '@/lib/store';
import type { Workout } from '@/lib/types';
import { Palette } from './palette';
import { Calendar } from './calendar';
import { WorkoutModal } from './workout-modal';

export function Agenda({
  monthIdx,
  setMonthIdx
}: {
  monthIdx: number;
  setMonthIdx: (i: number) => void;
}) {
  const { state, person, addWorkout, saveWorkout } = useStore();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [year, month] = MONTHS[monthIdx];
  const phase: 1 | 2 = year >= 2027 ? 2 : 1;

  // slepen pas na 6px, anders slikt de sensor gewone tikjes op
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const byDate = useMemo(() => {
    const out: Record<string, Workout[]> = {};
    for (const w of Object.values(state.workouts)) {
      if (w.person !== person) continue;
      (out[w.date] ||= []).push(w);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
  }, [state.workouts, person]);

  function place(date: string) {
    if (!selectedType) return;
    const id = addWorkout(selectedType, date);
    setSelectedType(null);
    setOpenId(id); // meteen invullen, scheelt een tik
  }

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id;
    if (typeof over !== 'string' || !over.startsWith('day:')) return;
    const date = over.slice(4);
    const active = String(e.active.id);
    if (active.startsWith('new:')) {
      const id = addWorkout(active.slice(4), date);
      setOpenId(id);
    } else if (active.startsWith('move:')) {
      saveWorkout(active.slice(5), { date });
    }
  }

  function navMonth(delta: number) {
    setMonthIdx(Math.min(MONTHS.length - 1, Math.max(0, monthIdx + delta)));
    setSelectedType(null);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <Banner year={year} month={month} />

      <main className="flex flex-col items-start gap-4 px-4 pb-10 pt-4 sm:px-6 md:flex-row">
        <aside className="w-full shrink-0 md:sticky md:top-3 md:w-[215px]">
          <Palette phase={phase} selected={selectedType} onSelect={setSelectedType} />
        </aside>

        <div className="w-full min-w-0 flex-1">
          <div className="mb-2.5 flex items-center justify-center gap-3.5">
            <button
              onClick={() => navMonth(-1)}
              disabled={monthIdx === 0}
              aria-label="Vorige maand"
              className="h-[38px] w-[38px] rounded-im-ctl bg-im-card text-[1.1rem] shadow-im-day disabled:opacity-30"
            >
              ‹
            </button>
            <h2 className="min-w-[190px] text-center text-[1.15rem] font-bold">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button
              onClick={() => navMonth(1)}
              disabled={monthIdx === MONTHS.length - 1}
              aria-label="Volgende maand"
              className="h-[38px] w-[38px] rounded-im-ctl bg-im-card text-[1.1rem] shadow-im-day disabled:opacity-30"
            >
              ›
            </button>
          </div>

          <Compare year={year} month={month} />

          <Calendar
            year={year}
            month={month}
            byDate={byDate}
            selectedType={selectedType}
            onPlace={place}
            onOpen={setOpenId}
          />
        </div>
      </main>

      {openId && <WorkoutModal id={openId} onClose={() => setOpenId(null)} />}
    </DndContext>
  );
}

/* ================= banner ================= */

function Banner({ year, month }: { year: number; month: number }) {
  let cls = 'border-[#e8d48a] bg-[#fff7e0] text-[#7a5c00]';
  let body: React.ReactNode = null;

  if (year === 2026 && month === 8) {
    body = (
      <>
        🔥 <b>Warm-up maand.</b> Vul bij elke training je tijden in — dit wordt
        jullie baseline. Vanaf oktober rollen hier persoonlijke targets uit die
        elke week iets scherper worden richting sub-5u.
      </>
    );
  } else if (year >= 2027) {
    cls = 'border-[#e8a09a] bg-[#fde9e7] text-[#8a2a20]';
    body = (
      <>
        💪 <b>Fase 2 — het echte werk.</b> Het palet is opgeschroefd: langere
        ritten, interval in elke discipline. De targets bouwen gewoon door op
        jullie progressie sinds september.
      </>
    );
  } else if (new Date(year, month, 1) >= new Date(2026, 9, 1)) {
    cls = 'border-[#9fd4b3] bg-[#e7f5ec] text-[#1c6b3c]';
    body = (
      <>
        🎯 <b>Target-fase.</b> Elke duurtraining toont je doeltempo voor die
        week, opgebouwd vanaf je september-baseline richting racetempo (week van
        12 april). Groen = gehaald.
      </>
    );
  }

  if (!body) return null;
  return (
    <div className={`mx-4 mt-3.5 rounded-im-day border px-4 py-2.5 text-[.9rem] sm:mx-6 ${cls}`}>
      {body}
    </div>
  );
}

/* ================= vergelijking per maand ================= */

function Compare({ year, month }: { year: number; month: number }) {
  const { state } = useStore();
  const first = `${year}-${pad(month + 1)}-01`;
  const last = `${year}-${pad(month + 1)}-31`;

  return (
    <div className="mb-2.5 flex flex-wrap gap-2.5">
      {PERSONS.map((p) => {
        const wos = Object.values(state.workouts).filter(
          (w) => w.person === p && w.date >= first && w.date <= last
        );
        const done = wos.filter((w) => w.stats?.done);

        const avg = (cat: string) => {
          const vals = wos
            .filter((w) => TYPES[w.type]?.cat === cat)
            .map(derivedSpeed)
            .filter((v): v is number => v != null);
          if (!vals.length) return null;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        };

        const bits: string[] = [];
        const runA = avg('run');
        const fietsA = avg('fiets');
        const zwemA = avg('zwem');
        if (runA) bits.push(`🏃 ${fmtPace(runA)}/km`);
        if (fietsA) bits.push(`🚴 ${fmtKmh(fietsA)}`);
        if (zwemA) bits.push(`🏊 ${fmtPace(zwemA)}/100m`);

        return (
          <div
            key={p}
            className="min-w-[230px] flex-1 rounded-im-day bg-im-card px-3.5 py-2.5 text-[.8rem] shadow-im-day"
          >
            <b className="text-[.9rem]">{NAMES[p]}</b> — {done.length}/{wos.length}{' '}
            trainingen afgevinkt
            <div className="mt-1 leading-relaxed text-im-muted">
              {bits.length
                ? 'Gemiddeld: ' + bits.join(' · ')
                : 'Nog geen tijden ingevuld deze maand'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
