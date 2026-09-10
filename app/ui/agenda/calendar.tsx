'use client';

import { useDroppable } from '@dnd-kit/core';
import { DAY_NAMES, MONTH_NAMES, RACE_DATE } from '@/lib/config';
import { addDays, iso, mondayOf, todayIso, weekNr } from '@/lib/calc';
import type { Workout } from '@/lib/types';
import { WorkoutCard } from './workout-card';
import { WeekExtras } from './week-extras';

type Props = {
  year: number;
  month: number;
  byDate: Record<string, Workout[]>;
  selectedType: string | null;
  onPlace: (date: string) => void;
  onOpen: (id: string) => void;
};

/** Weken van de zichtbare maand, elk als rij van zeven dagen. */
function weeksOfMonth(year: number, month: number) {
  const out: Date[] = [];
  let cur = mondayOf(new Date(year, month, 1));
  const end = new Date(year, month + 1, 0);
  while (cur <= end) {
    out.push(new Date(cur));
    cur = addDays(cur, 7);
  }
  return out;
}

export function Calendar(props: Props) {
  return (
    <>
      <MonthGrid {...props} />
      <WeekList {...props} />
    </>
  );
}

/* ================= desktop: maandrooster ================= */

function MonthGrid({ year, month, byDate, selectedType, onPlace, onOpen }: Props) {
  const weeks = weeksOfMonth(year, month);

  return (
    <table className="hidden w-full border-separate border-spacing-[5px] md:table">
      <thead>
        <tr>
          {DAY_NAMES.map((d) => (
            <th
              key={d}
              className="pb-0.5 text-[.72rem] font-semibold uppercase tracking-[1px] text-im-muted"
            >
              {d}
            </th>
          ))}
          <th className="pb-0.5 text-[.72rem] font-semibold uppercase tracking-[1px] text-im-muted">
            Week
          </th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((wkStart) => (
          <tr key={iso(wkStart)}>
            {Array.from({ length: 7 }, (_, i) => addDays(wkStart, i)).map((d) => (
              <DayCell
                key={iso(d)}
                date={d}
                month={month}
                items={byDate[iso(d)] ?? []}
                selectedType={selectedType}
                onPlace={onPlace}
                onOpen={onOpen}
              />
            ))}
            <td className="w-[96px] rounded-im-day bg-im-extras p-1.5 align-top">
              <WeekExtras weekKey={iso(wkStart)} wk={weekNr(wkStart)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayCell({
  date,
  month,
  items,
  selectedType,
  onPlace,
  onOpen
}: {
  date: Date;
  month: number;
  items: Workout[];
  selectedType: string | null;
  onPlace: (date: string) => void;
  onOpen: (id: string) => void;
}) {
  const ds = iso(date);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${ds}` });
  const other = date.getMonth() !== month;
  const isToday = ds === todayIso();
  const isRace = ds === RACE_DATE;

  return (
    <td
      ref={setNodeRef}
      onClick={() => selectedType && onPlace(ds)}
      className={`h-[96px] w-[12%] rounded-im-day p-1.5 align-top ${
        other ? 'bg-transparent opacity-45' : 'bg-im-card shadow-im-day'
      } ${isRace ? 'bg-im-race text-white' : ''} ${
        isToday ? 'outline outline-2 outline-im-accent' : ''
      } ${isOver ? 'ring-2 ring-im-ink' : ''} ${
        selectedType && !other ? 'cursor-copy' : ''
      }`}
    >
      <div
        className={`mb-1 text-[.78rem] font-bold ${isRace ? 'text-white' : 'text-im-muted'}`}
      >
        {date.getDate()}
      </div>
      {isRace && (
        <div className="mt-1.5 text-[.78rem] font-extrabold leading-tight">
          🏁 IRONMAN 70.3
          <br />
          VALENCIA
        </div>
      )}
      {items.map((w) => (
        <WorkoutCard key={w.id} w={w} onOpen={() => onOpen(w.id)} />
      ))}
    </td>
  );
}

/* ================= telefoon: lijst per week ================= */

function WeekList({ year, month, byDate, selectedType, onPlace, onOpen }: Props) {
  const weeks = weeksOfMonth(year, month);

  return (
    <div className="md:hidden">
      {weeks.map((wkStart) => (
        <section key={iso(wkStart)} className="mb-4">
          <div className="mb-1.5 rounded-im-day bg-im-extras px-2 py-1.5">
            <WeekExtras weekKey={iso(wkStart)} wk={weekNr(wkStart)} row />
          </div>

          {Array.from({ length: 7 }, (_, i) => addDays(wkStart, i))
            .filter((d) => d.getMonth() === month)
            .map((d) => {
              const ds = iso(d);
              const items = byDate[ds] ?? [];
              const isToday = ds === todayIso();
              const isRace = ds === RACE_DATE;
              return (
                <div
                  key={ds}
                  className={`mb-1.5 flex gap-2 rounded-im-day p-2 ${
                    isRace ? 'bg-im-race text-white' : 'bg-im-card shadow-im-day'
                  } ${isToday ? 'outline outline-2 outline-im-accent' : ''}`}
                >
                  <div
                    className={`w-[52px] shrink-0 text-[.74rem] font-bold ${
                      isRace ? 'text-white' : 'text-im-muted'
                    }`}
                  >
                    {DAY_NAMES[(d.getDay() + 6) % 7]} {d.getDate()}
                  </div>

                  <div className="min-w-0 flex-1">
                    {isRace && (
                      <div className="text-[.8rem] font-extrabold">
                        🏁 IRONMAN 70.3 VALENCIA
                      </div>
                    )}
                    {items.map((w) => (
                      <WorkoutCard key={w.id} w={w} onOpen={() => onOpen(w.id)} />
                    ))}
                    {selectedType ? (
                      <button
                        onClick={() => onPlace(ds)}
                        className="min-h-[36px] w-full rounded-im-ctl border border-dashed border-im-line text-[.78rem] font-semibold text-im-muted"
                      >
                        + hier plannen
                      </button>
                    ) : (
                      items.length === 0 && (
                        <div className="py-1 text-[.75rem] italic text-im-muted">
                          {MONTH_NAMES[month].slice(0, 3)} — niets gepland
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
        </section>
      ))}
    </div>
  );
}
