'use client';

import { useState } from 'react';
import { MONTHS } from '@/lib/config';
import { useStore } from '@/lib/store';
import { Header, type View } from './header';
import { Agenda } from './agenda/agenda';
import { Dashboard } from './dashboard/dashboard';
import { ImportBox } from './import-box';

/** Opent op de huidige maand als die binnen het schema valt. */
function initialMonth() {
  const now = new Date();
  const i = MONTHS.findIndex(([y, m]) => y === now.getFullYear() && m === now.getMonth());
  return i < 0 ? 0 : i;
}

export function Shell() {
  const { ready } = useStore();
  const [view, setView] = useState<View>('agenda');
  const [monthIdx, setMonthIdx] = useState(initialMonth);

  return (
    <>
      <Header view={view} setView={setView} />

      {!ready ? (
        <p className="px-4 py-8 text-[.9rem] italic text-im-muted sm:px-6">
          Trainingen ophalen…
        </p>
      ) : view === 'agenda' ? (
        <Agenda monthIdx={monthIdx} setMonthIdx={setMonthIdx} />
      ) : (
        <Dashboard />
      )}

      <ImportBox />
    </>
  );
}
