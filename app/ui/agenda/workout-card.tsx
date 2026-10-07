'use client';

import { useDraggable } from '@dnd-kit/core';
import { DEFAULT_KIND, KIND_SHORT, TYPES } from '@/lib/config';
import { derivedSpeed, fmtSpeed, fmtTijd, kindOf, structureSummary } from '@/lib/calc';
import { compliance, prescribe } from '@/lib/prescribe';
import { useStore } from '@/lib/store';
import type { Workout } from '@/lib/types';

const VERDICT = {
  hit: { cls: 'text-im-good', mark: '●' },
  close: { cls: 'text-im-warn', mark: '●' },
  miss: { cls: 'text-im-bad', mark: '●' }
} as const;

/**
 * Eén training in een dagcel. Nog niet gedaan: het voorschrift (wat je moet
 * doen). Gedaan: wat je deed, met een gekleurde stip voor hoe goed dat het
 * voorschrift volgde. Slepen mag, maar hoeft nooit.
 */
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
  const done = !!s.done;

  const plan = isKracht ? null : prescribe(state, w);
  const verdict = plan && done ? compliance(w, plan) : null;

  const meta: string[] = [];
  const structure = isKracht ? '' : structureSummary(w.structure, w.type);
  if (done && !isKracht) {
    if (s.tijdMin) meta.push(fmtTijd(s.tijdMin));
    const spd = derivedSpeed(w);
    // bij een gestructureerde training zegt het ritgemiddelde weinig: de blokken staan eronder
    if (spd != null && !structure && !w.indoor) meta.push(fmtSpeed(spd, w.type));
    if (w.indoor && s.vermogen) meta.push(`${s.vermogen} W`);
    if (s.gemHr) meta.push(`♥ ${s.gemHr}`);
  }

  // soort alleen tonen als die afwijkt van wat het type al zegt
  const showKind = !isKracht && w.kind && w.kind !== DEFAULT_KIND[w.type];
  const wind = t.cat === 'fiets' && done && !w.indoor ? w.wind : null;

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
      title={
        verdict
          ? `${t.label}: ${verdict.notes.join(' · ')}`
          : `${t.label} — klik om ${isKracht ? 'af te vinken' : 'het voorschrift te zien'}`
      }
    >
      {done ? '✅ ' : ''}
      {t.label}
      {showKind && <span className="font-normal"> · {KIND_SHORT[kind]}</span>}
      {w.indoor && <span title="binnen op de hometrainer"> 🏠</span>}
      {w.source === 'icu' && <span title="uit Garmin"> ⌚</span>}
      {verdict && (
        <span className={`ml-1 ${VERDICT[verdict.verdict].cls}`} aria-label={`oordeel: ${verdict.verdict}`}>
          {VERDICT[verdict.verdict].mark}
        </span>
      )}

      {!done && plan && (
        <span className="block text-[.68rem] font-semibold text-[#1c3a5a]">🎯 {plan.summary}</span>
      )}
      {meta.length > 0 && (
        <span className="block text-[.68rem] font-normal text-[#334]">{meta.join(' · ')}</span>
      )}
      {done && structure && (
        <span className="block text-[.68rem] font-normal text-[#334]">{structure}</span>
      )}
      {wind && (wind.bft != null || wind.headKm != null) && (
        <span className="block text-[.68rem] font-normal text-[#334]">
          💨 {wind.bft != null ? `${wind.bft} Bft` : ''}
          {wind.headKm != null
            ? ` · ${Math.round(wind.headKm)} km tegen`
            : wind.dir
              ? ` · ${wind.dir}`
              : ''}
        </span>
      )}
    </button>
  );
}
