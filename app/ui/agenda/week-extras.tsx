'use client';

import { weekRec } from '@/lib/calc';
import { useStore } from '@/lib/store';

const FIELDS = [
  { key: 'rek', emoji: '🧘', label: 'Rekmomenten' },
  { key: 'zuipen', emoji: '🍺', label: 'Avondjes zuipen' },
  { key: 'geneukt', emoji: '🍆', label: 'Geneukt' }
] as const;

/** De weektellers naast (of onder) de week. Per persoon, per week. */
export function WeekExtras({
  weekKey,
  wk,
  row
}: {
  weekKey: string;
  wk: number;
  row?: boolean;
}) {
  const { state, person, bumpWeekly } = useStore();
  const rec = weekRec(state, person, weekKey);

  return (
    <div className={row ? 'flex flex-wrap items-center gap-1.5' : ''}>
      <div
        className={`text-[.62rem] uppercase tracking-[.5px] text-im-muted ${
          row ? 'mr-1' : 'mb-1'
        }`}
      >
        wk {wk}
      </div>
      {FIELDS.map((f) => {
        const n = rec[f.key] || 0;
        return (
          <div
            key={f.key}
            className={`mb-1 flex items-center gap-1 rounded-[7px] border px-1 py-0.5 text-[.72rem] ${
              n > 0 ? 'border-im-good bg-im-extras-on' : 'border-[#d5dbe2] bg-white'
            }`}
          >
            <span className={row ? '' : 'flex-1'} aria-hidden>
              {f.emoji}
            </span>
            <button
              onClick={() => bumpWeekly(f.key, weekKey, -1)}
              aria-label={`${f.label} eentje minder`}
              className="h-[22px] w-[22px] rounded-[5px] bg-im-extras text-[.8rem] leading-none hover:bg-[#e2e6ea]"
            >
              −
            </button>
            <b className="min-w-[14px] text-center text-[.75rem] tabular-nums">{n}</b>
            <button
              onClick={() => bumpWeekly(f.key, weekKey, 1)}
              aria-label={`${f.label} eentje erbij`}
              className="h-[22px] w-[22px] rounded-[5px] bg-im-extras text-[.8rem] leading-none hover:bg-[#e2e6ea]"
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
