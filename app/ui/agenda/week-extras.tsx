'use client';

import { fromIso, weekRec } from '@/lib/calc';
import { defaultWeekKind, WEEK_LABEL, weekInfo } from '@/lib/prescribe';
import { useStore } from '@/lib/store';
import type { WeekKind } from '@/lib/types';

const KIND_STYLE: Record<WeekKind, string> = {
  build: 'border-[#d5dbe2] bg-white text-im-muted',
  rest: 'border-[#9fc5e8] bg-[#e8f1fb] text-[#1c4f80]',
  taper: 'border-[#e8d48a] bg-[#fff7e0] text-[#7a5c00]',
  race: 'border-im-ink bg-im-ink text-white'
};

/** Opbouw / rustweek / taper. Klikken zet de week om; geldt voor jullie allebei. */
function WeekKindToggle({ weekKey }: { weekKey: string }) {
  const { state, setWeekFlag } = useStore();
  const monday = fromIso(weekKey);
  const { kind, overridden, index } = weekInfo(state, monday);
  if (index < 0) return null; // september: warm-up, geen ritme

  const order: WeekKind[] = ['build', 'rest', 'taper'];
  const next = () => {
    const n = order[(order.indexOf(kind) + 1) % order.length];
    // terug bij het standaardritme = de markering weghalen
    setWeekFlag(weekKey, n === defaultWeekKind(monday) ? null : n);
  };

  return (
    <button
      onClick={next}
      title={`${WEEK_LABEL[kind]}${overridden ? ' (zelf omgezet)' : ''} — klik om om te zetten`}
      className={`mb-1 w-full rounded-[7px] border px-1 py-0.5 text-[.66rem] font-semibold ${KIND_STYLE[kind]}`}
    >
      {WEEK_LABEL[kind]}
      {overridden ? ' ✎' : ''}
    </button>
  );
}

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
      <WeekKindToggle weekKey={weekKey} />
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
