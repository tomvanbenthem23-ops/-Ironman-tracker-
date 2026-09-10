'use client';

import { useDraggable } from '@dnd-kit/core';
import { TYPES } from '@/lib/config';
import { derivedSpeed, fmtSpeed, fmtTijd, targetClass, targetFor } from '@/lib/calc';
import { useStore } from '@/lib/store';
import type { Workout } from '@/lib/types';

const TGT_COLOR = {
  hit: 'text-im-good',
  close: 'text-im-warn',
  miss: 'text-im-bad'
} as const;

/** Eén geplande training in een dagcel. Slepen mag, maar hoeft nooit. */
export function WorkoutCard({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const { state } = useStore();
  const t = TYPES[w.type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `move:${w.id}`
  });

  if (!t) return null;

  const s = w.stats || {};
  const spd = derivedSpeed(w);
  const meta: string[] = [];
  if (s.tijdMin) meta.push(fmtTijd(s.tijdMin));
  if (spd != null && t.cat !== 'kracht') meta.push(fmtSpeed(spd, w.type));
  if (s.rpe) meta.push(`RPE ${s.rpe}`);

  const tgt = targetFor(state, w.person, w.type, w.date);
  const cls = tgt != null && spd != null ? targetClass(spd, tgt, w.type) : null;

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={{ background: t.color, borderLeftColor: t.border }}
      className={`mb-1 w-full touch-manipulation rounded-im-ctl border-l-4 px-1.5 py-1 text-left text-[.72rem] font-semibold leading-tight text-im-ink ${
        isDragging ? 'opacity-40' : ''
      }`}
      title={`${t.label} — klik om je tijden in te vullen`}
    >
      {s.done ? '✅ ' : ''}
      {t.label}
      {meta.length > 0 && (
        <span className="block text-[.68rem] font-normal text-[#334]">
          {meta.join(' · ')}
        </span>
      )}
      {tgt != null && (
        <span className={`block text-[.68rem] font-semibold ${cls ? TGT_COLOR[cls] : ''}`}>
          🎯 {fmtSpeed(tgt, w.type)}
        </span>
      )}
    </button>
  );
}
