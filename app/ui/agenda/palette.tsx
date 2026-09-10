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

      {/* telefoon: chiprij die horizontaal scrolt. desktop: kolom */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:block md:overflow-visible md:px-0 md:pb-0">
        {keys.map((key) => (
          <PaletteItem
            key={key}
            k={key}
            selected={selected === key}
            onSelect={() => onSelect(selected === key ? null : key)}
          />
        ))}
      </div>

      <p className="mt-2 hidden text-[.74rem] leading-relaxed text-im-muted md:block">
        Sleep een training naar een dag, of klik hem aan en tik daarna op een dag.
        Klik op een geplande training om je tijden in te vullen. Slepen tussen
        dagen kan ook.
      </p>
      <p className="mt-2 text-[.74rem] leading-relaxed text-im-muted md:hidden">
        Tik een training aan en tik daarna op een dag. Tik op een geplande
        training om je tijden in te vullen.
      </p>

      <details className="mt-3.5 rounded-im-day bg-im-card p-3 text-[.78rem] leading-relaxed text-im-muted">
        <summary className="cursor-pointer font-semibold text-im-ink">
          🎯 Hoe werken de targets?
        </summary>
        <p className="mt-1.5">
          September is de warm-up maand: alles wat jullie invullen wordt de
          baseline. Vanaf oktober krijgt elke duurtraining een target dat
          wekelijks opschuift van jullie eigen baseline naar het racedoel in de
          week van 12 april. Vanaf januari schakelt het palet om naar het
          zwaardere schema; de targets van de nieuwe varianten bouwen door op
          jullie niveau van dat moment.
        </p>
        <p className="mt-1.5">
          <b>Racedoelen voor sub-5u (raceweek):</b>
          <br />
          Long run → 5:15 /km · Interval run → 4:40 /km · Easy run → 5:45 /km
          <br />
          60 min bike → 35 km/u · 90–120 min → 33 km/u · 150 min → 31 km/u
          <br />
          Swim 2000m → 2:00 /100m · Swim interval → 1:55 /100m
        </p>
        <p className="mt-1.5">
          Op de dag zelf: ±38 min zwemmen, ±2u40 fietsen, ±1u50 lopen plus
          wissels.
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
      className={`min-h-[38px] shrink-0 touch-manipulation rounded-im-day border-2 border-l-[5px] px-2.5 py-2 text-left text-[.88rem] font-semibold text-im-ink shadow-im-day md:mb-1.5 md:w-full md:shrink ${
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
