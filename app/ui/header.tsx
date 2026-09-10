'use client';

import { NAMES, PERSONS } from '@/lib/config';
import { fmtSigned, pandaScore } from '@/lib/calc';
import { useStore } from '@/lib/store';
import { Countdown } from './countdown';
import type { Person } from '@/lib/types';

export type View = 'agenda' | 'dash';

const SAVE_LABEL: Record<string, string> = {
  idle: '·',
  saving: '⏳ opslaan…',
  saved: '✓ opgeslagen',
  loaded: '✓ geladen',
  error: '⚠️ fout bij opslaan'
};

export function Header({
  view,
  setView
}: {
  view: View;
  setView: (v: View) => void;
}) {
  const { state, person, setPerson, saveState, pending, retry } = useStore();

  return (
    <header className="bg-im-navy px-4 pb-3 pt-4 text-white sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <h1 className="text-[1.1rem] font-bold tracking-[.5px] sm:text-[1.35rem]">
          🏊🚴🏃 IRONMAN 70.3 VALENCIA
          <small className="mt-0.5 block text-[.8rem] font-normal text-im-navy-soft">
            Zondag 18 april 2027 · doel: onder de 5 uur
          </small>
        </h1>

        <Countdown />

        <div className="flex gap-2.5 text-[.85rem]">
          {PERSONS.map((p) => (
            <div key={p} className="rounded-im-day bg-white/10 px-3 py-1.5">
              🐼 {NAMES[p]}:{' '}
              <b className="text-[1.05rem] tabular-nums">
                {fmtSigned(pandaScore(state, p))}
              </b>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex gap-1.5" role="tablist" aria-label="Persoon">
            {PERSONS.map((p) => (
              <PersonTab
                key={p}
                p={p}
                active={person === p}
                onClick={() => setPerson(p)}
              />
            ))}
          </div>

          <div className="flex gap-1.5" role="tablist" aria-label="Weergave">
            <ViewTab active={view === 'agenda'} onClick={() => setView('agenda')}>
              📅 Agenda
            </ViewTab>
            <ViewTab active={view === 'dash'} onClick={() => setView('dash')}>
              📊 Dashboard
            </ViewTab>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[.78rem] text-im-navy-soft">
          <span aria-live="polite">{SAVE_LABEL[saveState]}</span>
          {saveState === 'error' && pending > 0 && (
            <button
              onClick={retry}
              className="rounded-im-ctl bg-white/15 px-2.5 py-1 font-semibold text-white hover:bg-white/25"
            >
              {pending} wijziging{pending === 1 ? '' : 'en'} opnieuw versturen
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function PersonTab({
  p,
  active,
  onClick
}: {
  p: Person;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-[38px] rounded-t-im-day px-5 text-[1rem] font-semibold transition-colors sm:px-7 ${
        active ? 'bg-im-bg text-im-ink' : 'bg-white/15 text-[#cfdcea] hover:bg-white/25'
      }`}
    >
      {NAMES[p]}
    </button>
  );
}

function ViewTab({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-[34px] rounded-[9px] px-4 text-[.85rem] font-semibold transition-colors ${
        active ? 'bg-white text-im-ink' : 'bg-white/15 text-[#cfdcea] hover:bg-white/25'
      }`}
    >
      {children}
    </button>
  );
}
