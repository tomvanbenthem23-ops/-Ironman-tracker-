'use client';

import { useEffect, useState } from 'react';
import { CATS, KIND_ADVICE_LABEL, weekAdvice, type Cat, type WeekAdvice } from '@/lib/advice';
import { NAMES } from '@/lib/config';
import { fromIso, weekKeyOf, weekNr } from '@/lib/calc';
import { WEEK_LABEL } from '@/lib/prescribe';
import { useStore } from '@/lib/store';
import type { Kind } from '@/lib/types';

const CAT_UI: Record<Cat, { emoji: string; name: string }> = {
  run: { emoji: '🏃', name: 'Lopen' },
  fiets: { emoji: '🚴', name: 'Fietsen' },
  zwem: { emoji: '🏊', name: 'Zwemmen' }
};

/** Kort, voor in de smalle weekkolom. */
const SHORT: Record<Kind, string> = {
  long: 'long',
  easy: 'easy',
  threshold: 'drempel',
  interval: 'interval',
  endurance: 'duur',
  tempo: 'tempo',
  continuous: 'door',
  sets: 'sets',
  strength: 'kracht'
};

/**
 * Het weekadvies in de weekkolom: per discipline welke trainingen, de
 * belangrijkste vet. Alleen voor deze en komende weken. Klik voor het waarom.
 */
export function WeekAdviceChip({ weekKey }: { weekKey: string }) {
  const { state, person } = useStore();
  const [open, setOpen] = useState(false);
  if (weekKey < weekKeyOf(new Date())) return null;
  const adv = weekAdvice(state, person, weekKey);
  if (!adv) return null;
  const short = CATS.filter((c) => adv.planned[c] < adv.advised[c]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Weekadvies — klik voor het waarom"
        className="mb-1 w-full rounded-[7px] border border-[#b9d3ee] bg-[#f3f8fd] px-1 py-0.5 text-left text-[.62rem] leading-tight text-[#1c3a5a] hover:border-[#1c4f80]"
      >
        <span className="block font-bold">💡 advies</span>
        {CATS.map((c) => (
          <span key={c} className="block">
            {CAT_UI[c].emoji}{' '}
            {adv.sessions
              .filter((s) => s.cat === c)
              .map((s, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {s.key ? <b>{SHORT[s.kind]}</b> : SHORT[s.kind]}
                </span>
              ))}
            {short.includes(c) && (
              <span className="text-im-warn" title="minder gepland dan aangeraden">
                {' '}
                !
              </span>
            )}
          </span>
        ))}
        {adv.tips.some((t) => t.startsWith('Brick')) && <span className="block">🧱 brick</span>}
      </button>
      {open && <WeekAdviceModal adv={adv} onClose={() => setOpen(false)} />}
    </>
  );
}

function WeekAdviceModal({ adv, onClose }: { adv: WeekAdvice; onClose: () => void }) {
  const { person } = useStore();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,20,30,.55)] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weekadvies"
        className="max-h-[92vh] w-full max-w-[560px] overflow-auto rounded-im-card bg-white p-5"
      >
        <h3 className="text-[1.05rem] font-bold">
          💡 Weekadvies{' '}
          <span className="text-[.75rem] font-normal text-im-muted">
            {NAMES[person]} · week {weekNr(fromIso(adv.monday))} · {WEEK_LABEL[adv.weekKind]}
          </span>
        </h3>

        <p className="mb-3 mt-2 rounded-im-ctl bg-[#f0f4f8] px-3 py-2.5 text-[.85rem] leading-snug">{adv.focus}</p>

        {CATS.map((c) => {
          const list = adv.sessions.filter((s) => s.cat === c);
          const planned = adv.planned[c];
          const advised = adv.advised[c];
          return (
            <section key={c} className="mb-3">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[.74rem] font-bold uppercase tracking-[.5px] text-im-muted">
                  {CAT_UI[c].emoji} {CAT_UI[c].name}
                </span>
                <span
                  className={`text-[.72rem] font-semibold ${planned < advised ? 'text-im-warn' : 'text-im-good'}`}
                >
                  {planned < advised
                    ? `gepland ${planned} van ${advised} — plan er nog ${advised - planned}`
                    : `gepland ${planned} van ${advised}`}
                </span>
              </div>
              <ol className="space-y-1.5">
                {list.map((s, i) => (
                  <li key={i} className="rounded-im-ctl border border-im-line px-3 py-2 text-[.82rem]">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <b>{KIND_ADVICE_LABEL[s.kind]}</b>
                      {s.key && (
                        <span className="rounded-full bg-[#1c3a5a] px-2 py-px text-[.66rem] font-semibold text-white">
                          belangrijkste van de week
                        </span>
                      )}
                      {s.summary && <span className="text-[#1c3a5a]">🎯 {s.summary}</span>}
                    </div>
                    <p className="mt-0.5 text-[.76rem] leading-snug text-im-muted">{s.why}</p>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

        {adv.tips.length > 0 && (
          <ul className="mb-3 space-y-1 text-[.8rem] leading-snug">
            {adv.tips.map((t) => (
              <li key={t}>{t.startsWith('Brick') ? '🧱' : '↔'} {t}</li>
            ))}
          </ul>
        )}

        <p className="text-[.72rem] leading-snug text-im-muted">
          Geplande trainingen zonder eigen keuze krijgen deze soorten vanzelf, met het voorschrift erbij. Kies je in
          een training zelf een soort, dan gaat die voor. Het advies rekent met je fitheid tot maandag en blijft de hele
          week hetzelfde.
        </p>

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-im-ctl border border-im-line px-3 py-1.5 text-[.85rem] font-semibold hover:border-im-ink"
          >
            Sluit
          </button>
        </div>
      </div>
    </div>
  );
}
