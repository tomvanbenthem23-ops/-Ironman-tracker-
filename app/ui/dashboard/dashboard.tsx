'use client';

import { useMemo } from 'react';
import { BETTER, DISCIPLINES, DISC_REF, GOAL_MIN, NAMES } from '@/lib/config';
import {
  addDays,
  biggestGap,
  consistency,
  doneWorkouts,
  efAvg,
  estimateFinish,
  fmtDec,
  fmtHM,
  fmtSigned,
  fmtSpeedCat,
  garminRec,
  iso,
  pandaScore,
  speedsOf,
  summaryText,
  todayIso,
  trend,
  weekKeyOf,
  weekLoad,
  weeksSoFar,
  weekRec,
  weekVolume,
  windowAvg,
  type Trend
} from '@/lib/calc';
import { useStore } from '@/lib/store';
import type { Discipline } from '@/lib/types';
import { Bars, Caption, NoData, Sparkline } from './charts';

export function Dashboard() {
  const { state, person } = useStore();
  const naam = NAMES[person];

  const est = useMemo(() => estimateFinish(state, person), [state, person]);
  const wks = useMemo(() => weeksSoFar(), []);
  const volume = useMemo(
    () => wks.map((wk) => weekVolume(state, person, wk)),
    [wks, state, person]
  );
  const load = useMemo(() => wks.map((wk) => weekLoad(state, person, wk)), [wks, state, person]);
  const consPct = consistency(state, person);
  const lastVol = volume[volume.length - 1] || 0;
  const allDone = doneWorkouts(state, person).length;

  return (
    <section className="grid grid-cols-1 gap-3.5 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
      <Hero est={est} naam={naam} allDone={allDone} />

      {DISCIPLINES.map((d) => (
        <DisciplineCard key={d.cat} {...d} />
      ))}

      <Card title="📦 Volume & discipline">
        <Stat label="Uren afgelopen week" value={`${fmtDec(lastVol)} u`} />
        <Stat
          label="Consistentie (afgevinkt van gepland)"
          value={consPct == null ? '—' : `${consPct}%`}
        />
        <Stat
          label="Trainingsload-trend"
          value={
            <TrendMark
              t={trend(load[load.length - 1] || null, load[load.length - 2] || null, 'fiets')}
            />
          }
        />
        <Bars values={volume} color="#3d85c6" />
        <Caption>trainingsuren per week (laatste {wks.length} weken)</Caption>
      </Card>

      <GarminCard />
      <ExtrasCard wks={wks} />

      <Card title="🧠 Mijn analyse" full>
        <div
          className="text-[.92rem] leading-[1.65]"
          // alleen <b> uit onze eigen samenvatting, geen invoer van buiten
          dangerouslySetInnerHTML={{
            __html: summaryText(state, person, naam, est, consPct, lastVol)
          }}
        />
      </Card>
    </section>
  );
}

/* ================= eindtijd ================= */

function Hero({
  est,
  naam,
  allDone
}: {
  est: ReturnType<typeof estimateFinish>;
  naam: string;
  allDone: number;
}) {
  if (!est.complete) {
    const missing = [
      [est.sw, '🏊 zwemmen'],
      [est.bi, '🚴 fietsen'],
      [est.ru, '🏃 lopen']
    ]
      .filter(([v]) => !v)
      .map(([, l]) => l as string);

    return (
      <article className="rounded-im-card bg-im-hero p-4 text-white shadow-im-card sm:p-5 lg:col-span-full">
        <CardTitle onNavy>Geschatte eindtijd — {naam}</CardTitle>
        <div className="text-[1.8rem] font-extrabold tabular-nums sm:text-[2.4rem]">
          –:––{' '}
          <small className="text-[1rem] font-normal text-im-navy-soft">
            nog niet te berekenen
          </small>
        </div>
        <div className="mt-3 text-[.9rem]">
          Ik heb afgeronde trainingen met tijd + afstand nodig van elke
          discipline. Ontbreekt nog: <b>{missing.join(', ') || '?'}</b> (laatste 6
          weken).
        </div>
      </article>
    );
  }

  const total = est.total as number;
  const diff = total - GOAL_MIN;
  const margin = Math.round(total * 0.04);
  const gap = biggestGap(est);

  return (
    <article className="rounded-im-card bg-im-hero p-4 text-white shadow-im-card sm:p-5 lg:col-span-full">
      <CardTitle onNavy>
        <span className="flex flex-wrap justify-between gap-2">
          <span>Geschatte eindtijd — {naam}</span>
          <span>betrouwbaarheid: {est.conf}</span>
        </span>
      </CardTitle>

      <div className="text-[1.8rem] font-extrabold tabular-nums sm:text-[2.4rem]">
        {fmtHM(total)}{' '}
        <small className="text-[.9rem] font-normal text-im-navy-soft sm:text-[1rem]">
          ± {margin} min · op basis van {allDone} afgeronde trainingen
        </small>
      </div>

      <div className="mt-3 flex flex-wrap gap-2.5">
        <Split label="🏊 1.9 km" v={est.parts.zwem!} />
        <Split label="🚴 90 km" v={est.parts.fiets!} />
        <Split label="🏃 21.1 km" v={est.parts.run!} />
        <Split label="🔁 Wissels" v={est.parts.wissels} />
      </div>

      <div className="mt-3 text-[.9rem]">
        Doel 5:00 →{' '}
        {diff <= 0 ? (
          <span className="font-bold text-im-on-navy-good">
            je zit er {fmtHM(Math.abs(diff))} onder. Vasthouden.
          </span>
        ) : (
          <span className="font-bold text-im-on-navy-bad">
            nog {fmtHM(diff)} te winnen.
          </span>
        )}{' '}
        {gap && (
          <>
            Grootste winst zit in het <b>{gap}</b>.
          </>
        )}
      </div>
    </article>
  );
}

function Split({ label, v }: { label: string; v: number }) {
  return (
    <div className="min-w-[110px] flex-1 rounded-im-day bg-white/10 px-3 py-2 text-[.8rem]">
      {label}
      <b className="block text-[1.05rem] tabular-nums">{fmtHM(v)}</b>
    </div>
  );
}

/* ================= per discipline ================= */

function DisciplineCard({
  cat,
  emoji,
  naam,
  color
}: {
  cat: Discipline;
  emoji: string;
  naam: string;
  color: string;
}) {
  const { state, person } = useStore();
  const today = todayIso();
  const i28 = iso(addDays(new Date(), -28));
  const i56 = iso(addDays(new Date(), -56));

  const hist = speedsOf(doneWorkouts(state, person, cat)).slice(-10);
  if (!hist.length) {
    return (
      <Card title={`${emoji} ${naam}`}>
        <NoData>
          Nog geen afgeronde {naam.toLowerCase()}-trainingen met tijd en afstand.
        </NoData>
      </Card>
    );
  }

  const recent = windowAvg(state, person, cat, i28, today);
  const prev = windowAvg(state, person, cat, i56, i28);
  const efR = efAvg(state, person, cat, i28, today);
  const efP = efAvg(state, person, cat, i56, i28);
  const totalSessions = speedsOf(doneWorkouts(state, person, cat)).length;

  // omhoog moet altijd sneller betekenen, dus tempo's plotten we negatief
  const series = hist.map((x) =>
    BETTER[cat as 'run' | 'fiets' | 'zwem'] === 'low' ? -x.v : x.v
  );

  return (
    <Card title={`${emoji} ${naam}`}>
      <Stat
        label="Laatste 4 weken"
        value={
          <>
            {recent ? fmtSpeedCat(recent.v, cat) : '—'}{' '}
            <TrendMark t={trend(recent?.v ?? null, prev?.v ?? null, cat)} />
          </>
        }
      />
      <Stat
        label="Racedoel"
        value={fmtSpeedCat(DISC_REF[cat as 'run' | 'fiets' | 'zwem'], cat)}
      />
      <Stat
        label="Efficiëntie (snelheid/hartslag)"
        value={
          <>
            {efR ? fmtDec(efR) : '—'} <TrendMark t={trend(efR, efP, 'fiets')} />
          </>
        }
      />
      <Stat label="Sessies gelogd" value={String(totalSessions)} />
      <Sparkline values={series} color={color} />
      <Caption>verloop laatste {hist.length} sessies (omhoog = sneller)</Caption>
    </Card>
  );
}

/* ================= Garmin ================= */

function GarminCard() {
  const { state, person, saveGarmin, setEditing } = useStore();
  const wkNow = weekKeyOf(new Date());
  const g = garminRec(state, person, wkNow);

  const hist = Object.entries(state.garmin[person] ?? {})
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, r]) => r.vo2)
    .filter((v): v is number => v != null);

  const set = (field: 'vo2' | 'rhr' | 'gewicht', raw: string) => {
    const v = raw === '' ? null : Number(raw);
    saveGarmin(wkNow, { ...g, [field]: Number.isNaN(v as number) ? null : v });
  };

  return (
    <Card title="⌚ Garmin check-in (wekelijks)">
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <GarminInput label="VO2max" value={g.vo2} placeholder="bv. 50"
          onCommit={(v) => set('vo2', v)} onFocus={setEditing} />
        <GarminInput label="Rust-HR" value={g.rhr} placeholder="bv. 52"
          onCommit={(v) => set('rhr', v)} onFocus={setEditing} />
        <GarminInput label="Gewicht" value={g.gewicht} placeholder="kg" step="0.1"
          onCommit={(v) => set('gewicht', v)} onFocus={setEditing} />
      </div>

      {hist.length >= 2 ? (
        <>
          <Sparkline values={hist} color="#6aa84f" />
          <Caption>VO2max-verloop</Caption>
        </>
      ) : (
        <div className="mt-2">
          <NoData>
            Vul dit wekelijks in vanaf je Garmin — VO2max en rust-HR zijn de beste
            onafhankelijke check op mijn schatting.
          </NoData>
        </div>
      )}
    </Card>
  );
}

function GarminInput({
  label,
  value,
  placeholder,
  step,
  onCommit,
  onFocus
}: {
  label: string;
  value: number | null | undefined;
  placeholder: string;
  step?: string;
  onCommit: (v: string) => void;
  onFocus: (v: boolean) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[.68rem] uppercase tracking-[.5px] text-im-muted">
        {label}
      </span>
      <input
        type="number"
        step={step}
        inputMode="decimal"
        defaultValue={value ?? ''}
        key={String(value ?? '')}
        placeholder={placeholder}
        onFocus={() => onFocus(true)}
        onBlur={(e) => {
          onFocus(false);
          onCommit(e.target.value);
        }}
        className="w-full rounded-im-ctl border border-im-line px-2 py-1.5 text-[.9rem] outline-none focus:border-im-accent focus:ring-2 focus:ring-im-accent/25"
      />
    </label>
  );
}

/* ================= neven-activiteiten ================= */

function ExtrasCard({ wks }: { wks: string[] }) {
  const { state, person } = useStore();
  const sum = (f: 'rek' | 'zuipen' | 'geneukt') =>
    wks.reduce((a, wk) => a + (weekRec(state, person, wk)[f] || 0), 0);

  return (
    <Card title={`🧾 Neven-activiteiten (laatste ${wks.length} wkn)`}>
      <Stat label="🧘 Rekmomenten" value={String(sum('rek'))} />
      <Stat label="🍺 Avondjes zuipen" value={String(sum('zuipen'))} />
      <Stat label="🍆 Geneukt" value={String(sum('geneukt'))} />
      <Stat label="🐼 Panda counter" value={fmtSigned(pandaScore(state, person))} />
    </Card>
  );
}

/* ================= bouwstenen ================= */

function Card({
  title,
  children,
  full
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <article
      className={`rounded-im-card bg-im-card p-4 shadow-im-card sm:px-5 ${
        full ? 'lg:col-span-full' : ''
      }`}
    >
      <CardTitle>{title}</CardTitle>
      {children}
    </article>
  );
}

function CardTitle({
  children,
  onNavy
}: {
  children: React.ReactNode;
  onNavy?: boolean;
}) {
  return (
    <h3
      className={`mb-2.5 text-[.78rem] font-semibold uppercase tracking-[1px] ${
        onNavy ? 'text-im-navy-soft' : 'text-im-muted'
      }`}
    >
      {children}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-im-hairline py-1.5 text-[.87rem] last:border-b-0">
      <span>{label}</span>
      <b className="text-right tabular-nums">{value}</b>
    </div>
  );
}

function TrendMark({ t }: { t: Trend }) {
  if (t.kind === 'none') return <span className="text-[.78rem] text-im-muted">—</span>;
  if (t.kind === 'flat')
    return <span className="text-[.78rem] text-im-muted">≈ gelijk</span>;
  return (
    <span
      className={`text-[.78rem] font-bold ${
        t.kind === 'up' ? 'text-im-good' : 'text-im-bad'
      }`}
    >
      {t.kind === 'up' ? `▲ ${t.pct}% beter` : `▼ ${t.pct}% minder`}
    </span>
  );
}
