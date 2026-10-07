'use client';

import { useDraggable } from '@dnd-kit/core';
import { DEFAULT_KIND, KIND_SHORT, TYPES } from '@/lib/config';
import {
  derivedSpeed,
  fmtSpeed,
  fmtTijd,
  kindOf,
  structureSummary,
  targetClass,
  targetFor
} from '@/lib/calc';
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
  const isKracht = t.cat === 'kracht';
  const kind = kindOf(w);

  const meta: string[] = [];
  const structure = isKracht ? '' : structureSummary(w.structure, w.type);
  const spd = isKracht ? null : derivedSpeed(w);
  if (!isKracht) {
    if (s.tijdMin) meta.push(fmtTijd(s.tijdMin));
    // bij een gestructureerde training zegt het ritgemiddelde weinig: de blokken staan eronder
    if (spd != null && !structure) meta.push(fmtSpeed(spd, w.type));
    if (s.gemHr) meta.push(`♥ ${s.gemHr}`);
  }

  const tgt = isKracht ? null : targetFor(state, w.person, w.type, w.date);
  const cls = tgt != null && spd != null ? targetClass(spd, tgt, w.type) : null;

  // soort alleen tonen als die afwijkt van wat het type al zegt
  const showKind = !isKracht && w.kind && w.kind !== DEFAULT_KIND[w.type];

  const wind = t.cat === 'fiets' ? w.wind : null;

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
      title={`${t.label} — klik om ${isKracht ? 'af te vinken' : 'je tijden in te vullen'}`}
    >
      {s.done ? '✅ ' : ''}
      {t.label}
      {showKind && <span className="font-normal"> · {KIND_SHORT[kind]}</span>}
      {w.source === 'icu' && <span title="uit Garmin"> ⌚</span>}
      {meta.length > 0 && (
        <span className="block text-[.68rem] font-normal text-[#334]">{meta.join(' · ')}</span>
      )}
      {structure && (
        <span className="block text-[.68rem] font-normal text-[#334]">{structure}</span>
      )}
      {wind && (wind.bft != null || wind.headKm != null) && (
        <span className="block text-[.68rem] font-normal text-[#334]">
          💨 {wind.bft != null ? `${wind.bft} Bft` : ''}
          {wind.headKm != null ? ` · ${Math.round(wind.headKm)} km tegen` : wind.dir ? ` · ${wind.dir}` : ''}
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
