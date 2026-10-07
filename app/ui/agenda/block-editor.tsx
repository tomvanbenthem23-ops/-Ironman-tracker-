'use client';

import { TYPES } from '@/lib/config';
import { emptyRow, type BlockRow } from '@/lib/blocks';

export { blocksToRows, rowsToBlocks, type BlockRow } from '@/lib/blocks';

/**
 * Invoer van de structuur van een training: "6 × 800 m @ 4:00 /km, rust 1:30",
 * "2 × 20 min @ 4:24 /km", "7 × 200 m @ 1:50 /100m". Per blok kun je ook de
 * gerealiseerde tempo's per herhaling kwijt — straks komen die uit Garmin.
 *
 * De editor werkt met tekstvelden en zet pas bij opslaan om naar Blocks, zodat
 * halve invoer ("4:0") niet tussentijds wegspringt.
 */

export function BlockEditor({
  rows,
  onChange,
  type
}: {
  rows: BlockRow[];
  onChange: (rows: BlockRow[]) => void;
  type: string;
}) {
  const cat = TYPES[type]?.cat;
  const unit = cat === 'fiets' ? 'km/u of W' : cat === 'zwem' ? 'min/100m' : 'min/km';
  const workHint = cat === 'zwem' ? '200 m' : cat === 'fiets' ? '12 min' : '800 m of 20 min';
  const speedHint = cat === 'fiets' ? '32 of 210 W' : cat === 'zwem' ? '1:50' : '4:00';

  const set = (i: number, patch: Partial<BlockRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[.74rem] font-bold uppercase tracking-[.5px] text-im-muted">
        Opbouw
      </div>

      {rows.length === 0 && (
        <p className="mb-1.5 text-[.8rem] italic text-im-muted">
          Nog geen blokken. Bijvoorbeeld 6 × 800 m @ 4:00, rust 1:30.
        </p>
      )}

      {rows.map((r, i) => (
        <div key={i} className="mb-2 rounded-im-ctl bg-[#f6f8fa] p-2">
          <div className="grid grid-cols-[52px_14px_1fr_14px_1fr_1fr_28px] items-center gap-1.5 text-[.85rem]">
            <input
              aria-label="Aantal herhalingen"
              value={r.reps}
              onChange={(e) => set(i, { reps: e.target.value })}
              inputMode="numeric"
              placeholder="6"
              className={CELL}
            />
            <span className="text-center text-im-muted">×</span>
            <input
              aria-label="Werkdeel: afstand of tijd"
              value={r.work}
              onChange={(e) => set(i, { work: e.target.value })}
              placeholder={workHint}
              className={CELL}
            />
            <span className="text-center text-im-muted">@</span>
            <input
              aria-label={`Doeltempo (${unit})`}
              value={r.speed}
              onChange={(e) => set(i, { speed: e.target.value })}
              placeholder={speedHint}
              className={CELL}
            />
            <input
              aria-label="Rust tussen herhalingen"
              value={r.rest}
              onChange={(e) => set(i, { rest: e.target.value })}
              placeholder="rust 1:30"
              className={CELL}
            />
            <button
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              aria-label="Blok verwijderen"
              className="h-[30px] w-[28px] rounded-im-ctl text-im-muted hover:bg-[#fbe3e3] hover:text-im-bad"
            >
              ✕
            </button>
          </div>
          <input
            aria-label="Gerealiseerd tempo per herhaling"
            value={r.actual}
            onChange={(e) => set(i, { actual: e.target.value })}
            placeholder={`gerealiseerd per herhaling (${unit}), bv. ${
              cat === 'fiets' ? '33,5, 32,8' : '4:01, 3:58, 3:57'
            }`}
            className={`${CELL} mt-1.5 w-full`}
          />
        </div>
      ))}

      <button
        onClick={() => onChange([...rows, emptyRow()])}
        className="rounded-im-ctl border border-dashed border-im-line px-3 py-1.5 text-[.8rem] font-semibold text-im-muted hover:border-im-ink hover:text-im-ink"
      >
        + blok
      </button>
    </div>
  );
}

const CELL =
  'min-w-0 rounded-im-ctl border border-im-line bg-white px-2 py-1.5 text-[.85rem] outline-none focus:border-im-accent focus:ring-2 focus:ring-im-accent/25';
