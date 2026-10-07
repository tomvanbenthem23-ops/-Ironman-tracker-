'use client';

import { useDraggable } from '@dnd-kit/core';
import { TYPES } from '@/lib/config';

/**
 * Het palet met trainingen van de fase waar je naar kijkt.
 * Tikken selecteert (en dan tik je een dag aan); slepen mag ook, op een muis.
 */
export function Palette({
  phase,
  selected,
  onSelect
}: {
  phase: 1 | 2;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const keys = Object.keys(TYPES).filter((k) => TYPES[k].phase === phase);

  return (
    <>
      <h2 className="mb-2 text-[.8rem] font-semibold uppercase tracking-[1px] text-im-muted">
        {phase === 2 ? 'Trainingen — fase 2' : 'Trainingen — opbouw'}
      </h2>

      <div>
        {keys.map((key) => (
          <PaletteItem
            key={key}
            k={key}
            selected={selected === key}
            onSelect={() => onSelect(selected === key ? null : key)}
          />
        ))}
      </div>

      <p className="mt-2 text-[.74rem] leading-relaxed text-im-muted">
        Sleep een training naar een dag, of klik hem aan en tik daarna op een dag.
        Klik op een geplande training om je tijden in te vullen. Slepen tussen
        dagen kan ook.
      </p>

      <details className="mt-3.5 rounded-im-day bg-im-card p-3 text-[.78rem] leading-relaxed text-im-muted">
        <summary className="cursor-pointer font-semibold text-im-ink">
          🎯 Hoe werken de voorschriften?
        </summary>
        <p className="mt-1.5">
          Elke geplande training krijgt een voorschrift: afstand of duur, tempo of
          hartslag, en bij kwaliteitstrainingen de opbouw (bv. 6 × 800 m). Dat
          rekent de tracker uit jullie eigen trainingen van de laatste weken —
          drempeltempo, zone-2-tempo, duursnelheid op de fiets en zwem-CSS — en
          schuift het elke opbouwweek een stap op richting wat sub-5 vraagt.
        </p>
        <p className="mt-1.5">
          Long runs zijn altijd zone 2: daar is de hartslag het doel en het tempo
          alleen een verwachting. Elke vierde week is een rustweek (±35% minder);
          klik in de weekkolom om een week om te zetten.
        </p>
        <p className="mt-1.5">
          <b>Sub-5 op de dag zelf:</b>
          <br />
          zwemmen 0:37 (1:57 /100m) · fietsen 2:33 (35,3 km/u) · lopen 1:42
          (4:50 /km) · wissels 0:08
        </p>
      </details>
    </>
  );
}

function PaletteItem({
  k,
  selected,
  onSelect
}: {
  k: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = TYPES[k];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new:${k}`
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      aria-pressed={selected}
      style={{ background: t.color, borderLeftColor: t.border }}
      className={`min-h-[38px] w-full rounded-im-day border-2 border-l-[5px] px-2.5 py-2 text-left text-[.88rem] font-semibold text-im-ink shadow-im-day mb-1.5 ${
        selected ? 'border-im-ink ring-2 ring-im-ink/15' : 'border-transparent'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {t.label}
      {t.sub && (
        <small className="block text-[.74rem] font-normal text-[#445]">{t.sub}</small>
      )}
    </button>
  );
}
