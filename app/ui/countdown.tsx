'use client';

import { useEffect, useState } from 'react';
import { RACE } from '@/lib/config';
import { pad } from '@/lib/calc';

/**
 * Aftellen naar de start. Staat bewust in een eigen component: hij tikt elke
 * seconde en mag de rest van de pagina niet meeslepen in die hertekening.
 */
export function Countdown() {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMs(+RACE - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  if (ms == null) {
    // eerste server-render: geen tijd tonen, anders wijkt de hydratatie af
    return <div className="flex gap-2" aria-hidden />;
  }

  if (ms <= 0) {
    return (
      <div className="flex gap-2">
        <Box b="🏁" label="RACE DAY" wide />
      </div>
    );
  }

  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;

  return (
    <div
      className="flex gap-2"
      role="timer"
      aria-label={`Nog ${d} dagen tot de race`}
    >
      <Box b={String(d)} label="dagen" />
      <Box b={pad(h)} label="uur" />
      <Box b={pad(m)} label="min" />
      <Box b={pad(s)} label="sec" />
    </div>
  );
}

function Box({ b, label, wide }: { b: string; label: string; wide?: boolean }) {
  return (
    <div
      className={`rounded-im-day border border-white/20 bg-white/10 px-2.5 py-1.5 text-center ${
        wide ? 'min-w-[120px]' : 'min-w-[48px] sm:min-w-[62px]'
      }`}
    >
      <b className="block text-[1rem] font-bold tabular-nums sm:text-[1.3rem]">{b}</b>
      <span className="text-[.62rem] uppercase tracking-[1px] text-im-navy-soft">
        {label}
      </span>
    </div>
  );
}
