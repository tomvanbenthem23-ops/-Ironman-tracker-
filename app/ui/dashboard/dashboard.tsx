'use client';

import { useMemo } from 'react';
import { DISCIPLINES, GOAL_SPLITS, NAMES } from '@/lib/config';
import {
  addDays,
  consistency,
  doneWorkouts,
  fmtDec,
  fmtHM,
  fmtPace,
  fmtSigned,
  garminRec,
  iso,
  pandaScore,
  trend,
  weekKeyOf,
  weekLoad,
  weeksSoFar,
  weekRec,
  weekVolume,
  type Trend
} from '@/lib/calc';
import { anchors, type Anchor } from '@/lib/fitness';
import { REQUIRED } from '@/lib/prescribe';
import { LEG_LABEL, raceSummary, raceView, type Estimate, type Leg, type LegKey } from '@/lib/race';
import { useStore } from '@/lib/store';
import type { Discipline, Person, State } from '@/lib/types';
import { Bars, Caption, NoData, Sparkline } from './charts';

export function Dashboard() {
  const { state, person } = useStore();
  const naam = NAMES[person];

  const view = useMemo(() => raceView(state, person), [state, person]);
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
    <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5 px-6 pb-10 pt-4">
      <Hero view={view} naam={naam} />

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
        <Caption>trainingsuren per week (laatste {wks.length} weken, zonder kracht)</Caption>
      </Card>

      <GarminCard />
      <ExtrasCard wks={wks} />

      <Card title="🧠 Mijn analyse" full>
        <div
          className="text-[.92rem] leading-[1.65]"
          // alleen <b> uit onze eigen samenvatting, geen invoer van buiten
          dangerouslySetInnerHTML={{ __html: raceSummary(view, naam, consPct, lastVol, allDone) }}
        />
      </Card>
    </section>
  );
}

/* ================= eindtijd ================= */

const LEGS: { key: LegKey; label: string; unit: (v: number) => string }[] = [
  { key: 'zwem', label: '🏊 1,9 km', unit: (v) => `${fmtPace(v)} /100m` },
  { key: 'fiets', label: '🚴 90 km', unit: (v) => `${fmtDec(v)} km/u` },
  { key: 'run', label: '🏃 21,1 km', unit: (v) => `${fmtPace(v)} /km` }
];

function Hero({ view, naam }: { view: ReturnType<typeof raceView>; naam: string }) {
  const { today, projected, biggestGap } = view;

  return (
    <article className="col-span-full rounded-im-card bg-im-hero p-5 text-white shadow-im-card">
      <CardTitle onNavy>Geschatte eindtijd — {naam}</CardTitle>

      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Big label="Als je vandaag racet" est={today} />
        <Big
          label="Projectie 18 april"
          est={projected}
          sub={`als je blijft trainen zoals de laatste 4 weken (${Math.round(view.adherence * 100)}% trouw)`}
        />
        <div className="self-end pb-1 text-[.85rem]">
          {projected.complete ? (
            projected.total! <= 300 ? (
              <span className="font-bold text-im-on-navy-good">
                Onder de 5 uur. Vasthouden en niet blesseren.
              </span>
            ) : (
              <span>
                <span className="font-bold text-im-on-navy-bad">
                  Nog {fmtHM(projected.total! - 300)} te winnen.
                </span>{' '}
                {biggestGap && (
                  <>
                    Grootste tekort: <b>{LEG_LABEL[biggestGap.key]}</b>.
                  </>
                )}
              </span>
            )
          ) : (
            <span className="text-im-navy-soft">
              Nog niet compleet — hieronder staat per onderdeel wat er ontbreekt.
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        {LEGS.map((l) => (
          <LegBox
            key={l.key}
            label={l.label}
            leg={today.legs[l.key]}
            proj={projected.legs[l.key]}
            unit={l.unit}
          />
        ))}
        <div className="rounded-im-day bg-white/10 px-3 py-2 text-[.8rem]">
          🔁 Wissels
          <b className="block text-[1.05rem] tabular-nums">{fmtHM(today.wissels)}</b>
          <span className="text-[.7rem] text-im-navy-soft">
            vaste aanname · 5:00 vraagt {fmtHM(GOAL_SPLITS.wissels)}
          </span>
        </div>
      </div>
    </article>
  );
}

function Big({ label, est, sub }: { label: string; est: Estimate; sub?: string }) {
  return (
    <div>
      <div className="text-[.72rem] uppercase tracking-[1px] text-im-navy-soft">{label}</div>
      {sub && <div className="text-[.68rem] text-im-navy-soft">{sub}</div>}
      <div className="text-[2.4rem] font-extrabold leading-tight tabular-nums">
        {est.complete ? fmtHM(est.total!) : '–:––'}
        {est.complete && (
          <small className="ml-1.5 text-[1rem] font-normal text-im-navy-soft">
            ± {Math.round(est.margin!)} min
          </small>
        )}
      </div>
    </div>
  );
}

function LegBox({
  label,
  leg,
  proj,
  unit
}: {
  label: string;
  leg: Leg;
  proj: Leg;
  unit: (v: number) => string;
}) {
  const over = proj.min != null ? proj.min - leg.goal : null;
  return (
    <div className="rounded-im-day bg-white/10 px-3 py-2 text-[.8rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {leg.confidence && (
          <span className="text-[.68rem] text-im-navy-soft">{leg.confidence}</span>
        )}
      </div>
      {leg.min != null ? (
        <>
          <b className="block text-[1.05rem] tabular-nums">
            {fmtHM(leg.min)}
            <span className="ml-1 text-[.75rem] font-normal text-im-navy-soft">
              {unit(leg.pace!)}
            </span>
          </b>
          <span className="block text-[.72rem] text-im-navy-soft">
            18 apr {fmtHM(proj.min!)} · 5:00 vraagt {fmtHM(leg.goal)}
            {over != null && (
              <span className={over > 0.5 ? 'text-im-on-navy-bad' : 'text-im-on-navy-good'}>
                {' '}
                ({over > 0 ? '+' : '−'}
                {Math.round(Math.abs(over))} min)
              </span>
            )}
          </span>
          <span className="mt-1.5 block text-[.72rem]">
            Raceklaar{' '}
            <b className={leg.ready >= 0.75 ? 'text-im-on-navy-good' : 'text-im-on-navy-bad'}>
              {Math.round(leg.ready * 100)}%
            </b>
            <span className="block text-[.68rem] text-im-navy-soft">{leg.readyNote}</span>
          </span>
          <span
            className="mt-1 block text-[.68rem] leading-snug text-im-navy-soft"
            title={leg.basis.join(' · ')}
          >
            {leg.method} · {leg.basis[0]}
          </span>
        </>
      ) : (
        <>
          <b className="block text-[1.05rem]">–:––</b>
          <span className="block text-[.72rem] text-im-navy-soft">{leg.missing}</span>
        </>
      )}
    </div>
  );
}

/* ================= per discipline: de fitheidsmaten ================= */

const WEEKS_BACK = 10;

/** Waarde van een anker op elke maandag van de laatste tien weken. */
function history(
  state: State,
  person: Person,
  pick: (a: ReturnType<typeof anchors>) => Anchor | null
) {
  const out: number[] = [];
  for (let i = WEEKS_BACK - 1; i >= 0; i--) {
    const v = pick(anchors(state, person, iso(addDays(new Date(), 1 - 7 * i))));
    if (v) out.push(v.value);
  }
  return out;
}

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
  // morgen als peildatum: de trainingen van vandaag tellen mee
  const a = anchors(state, person, iso(addDays(new Date(), 1)));

  if (cat === 'run') {
    const series = history(state, person, (x) => x.runThreshold).map((v) => -v);
    return (
      <Card title={`${emoji} ${naam}`}>
        <AnchorStat
          label="Drempeltempo"
          a={a.runThreshold}
          fmt={(v) => `${fmtPace(v)} /km`}
          need={`${fmtPace(REQUIRED.runThreshold)} /km`}
        />
        <AnchorStat label="Tempo in zone 2" a={a.runZ2} fmt={(v) => `${fmtPace(v)} /km`} />
        <AnchorStat
          label="Long run (mediaan laatste 3)"
          a={a.longRunKm}
          fmt={(v) => `${fmtDec(v)} km`}
        />
        <Stat
          label="Zone 2"
          value={a.z2.high ? `${a.z2.low ?? '?'}–${a.z2.high} bpm` : 'niet ingesteld'}
        />
        {series.length >= 2 ? (
          <>
            <Sparkline values={series} color={color} />
            <Caption>drempeltempo per week, laatste {WEEKS_BACK} weken (omhoog = sneller)</Caption>
          </>
        ) : (
          <Hint>
            Drempeltempo komt uit threshold- en intervalblokken. Doe er één en vul het tempo per
            herhaling in — of laat Garmin het doen.
          </Hint>
        )}
      </Card>
    );
  }

  if (cat === 'fiets') {
    const series = history(state, person, (x) => x.bikeEndurance);
    return (
      <Card title={`${emoji} ${naam}`}>
        <AnchorStat
          label="Duursnelheid (windgecorrigeerd)"
          a={a.bikeEndurance}
          fmt={(v) => `${fmtDec(v)} km/u`}
          need={`race ${fmtDec(REQUIRED.bikeKmh)} km/u`}
        />
        <AnchorStat label="FTP" a={a.ftp} fmt={(v) => `${Math.round(v)} W`} />
        {series.length >= 2 ? (
          <>
            <Sparkline values={series} color={color} />
            <Caption>duursnelheid per week, laatste {WEEKS_BACK} weken</Caption>
          </>
        ) : (
          <Hint>
            Duursnelheid komt uit duurritten van 45+ minuten. Met wind erbij (automatisch via
            Garmin, of zelf invullen) wordt hij betrouwbaarder.
          </Hint>
        )}
      </Card>
    );
  }

  const series = history(state, person, (x) => x.css).map((v) => -v);
  return (
    <Card title={`${emoji} ${naam}`}>
      <AnchorStat
        label="CSS"
        a={a.css}
        fmt={(v) => `${fmtPace(v)} /100m`}
        need={`${fmtPace(REQUIRED.swimCss)} /100m`}
      />
      {series.length >= 2 ? (
        <>
          <Sparkline values={series} color={color} />
          <Caption>CSS per week, laatste {WEEKS_BACK} weken (omhoog = sneller)</Caption>
        </>
      ) : (
        <Hint>
          CSS komt uit setherhalingen van 100–400 m. Vul bij een set je tijd per herhaling in.
        </Hint>
      )}
    </Card>
  );
}

function AnchorStat({
  label,
  a,
  fmt,
  need
}: {
  label: string;
  a: Anchor | null;
  fmt: (v: number) => string;
  need?: string;
}) {
  return (
    <div className="border-b border-dashed border-im-hairline py-1.5 text-[.87rem] last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        <b className="text-right tabular-nums">{a ? fmt(a.value) : '—'}</b>
      </div>
      {(a || need) && (
        <div className="flex justify-between gap-3 text-[.7rem] text-im-muted">
          <span className="truncate" title={a?.basis.join(' · ')}>
            {a ? `${a.confidence} · ${a.basis[0] ?? ''}` : ''}
          </span>
          {need && <span className="shrink-0">sub-5: {need}</span>}
        </div>
      )}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[.78rem] italic leading-snug text-im-muted">{children}</p>;
}

/* ================= Garmin ================= */

function GarminCard() {
  const { state, person, saveGarmin, saveSettings, setEditing } = useStore();
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

  const auto = !!state.integrations[person];
  const ps = state.settings[person] ?? {};
  const last = ps.lastSync ? new Date(ps.lastSync) : null;
  const num = (raw: string) => (raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw));

  return (
    <Card title={auto ? '⌚ Garmin (automatisch)' : '⌚ Garmin check-in (wekelijks)'}>
      {auto && (
        <div className="-mt-1.5 mb-1 text-[.72rem] text-im-muted">
          via intervals.icu
          {last &&
            ` · laatst opgehaald ${last.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${last.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`}
          {' · '}je kunt een waarde altijd overschrijven
        </div>
      )}
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
            {auto
              ? 'VO2max en rust-HR komen vanzelf binnen zodra je horloge ze heeft.'
              : 'Vul dit wekelijks in vanaf je Garmin — VO2max en rust-HR zijn de beste onafhankelijke check op mijn schatting.'}
          </NoData>
        </div>
      )}

      <div className="mt-3 border-t border-dashed border-im-hairline pt-2.5">
        <div className="mb-1 flex items-baseline justify-between text-[.72rem] uppercase tracking-[.5px] text-im-muted">
          <span>Max-HR en zone 2</span>
          <span className="normal-case tracking-normal">
            {ps.z2Source === 'garmin'
              ? 'zone 2 uit je Garmin-zones'
              : ps.z2Source === 'manual'
                ? 'zone 2 zelf ingevuld'
                : ps.maxHr
                  ? `zone 2 = 60–70% van max: ${Math.round(ps.maxHr * 0.6)}–${Math.round(ps.maxHr * 0.7)}`
                  : 'nog niet ingesteld'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <GarminInput label="Max-HR" value={ps.maxHr} placeholder="bv. 195"
            onCommit={(v) => num(v) !== (ps.maxHr ?? null) && saveSettings({ maxHr: num(v) })}
            onFocus={setEditing} />
          <GarminInput label="Van (bpm)" value={ps.z2Low} placeholder="bv. 130"
            onCommit={(v) => num(v) !== (ps.z2Low ?? null) && saveSettings({ z2Low: num(v), z2High: ps.z2High ?? null })}
            onFocus={setEditing} />
          <GarminInput label="Tot (bpm)" value={ps.z2High} placeholder="bv. 148"
            onCommit={(v) => num(v) !== (ps.z2High ?? null) && saveSettings({ z2Low: ps.z2Low ?? null, z2High: num(v) })}
            onFocus={setEditing} />
          <GarminInput label="FTP (W)" value={ps.ftp} placeholder="optioneel"
            onCommit={(v) => num(v) !== (ps.ftp ?? null) && saveSettings({ ftp: num(v) })}
            onFocus={setEditing} />
        </div>
      </div>
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
      className={`rounded-im-card bg-im-card px-5 py-4 shadow-im-card ${
        full ? 'col-span-full' : ''
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
