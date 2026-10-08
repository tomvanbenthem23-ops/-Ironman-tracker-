'use client';

import { useEffect, useMemo, useState } from 'react';
import { KINDS, MONTH_NAMES, NAMES, TYPES } from '@/lib/config';
import {
  fmtPace,
  fmtSpeed,
  fmtTijd,
  fromIso,
  parseNum,
  parseSpeed,
  parseTijd
} from '@/lib/calc';
import { plannedKind } from '@/lib/advice';
import { compliance, prescribe, WEEK_LABEL } from '@/lib/prescribe';
import { useStore } from '@/lib/store';
import type { Kind, Stats, Wind, WindDir } from '@/lib/types';
import { BlockEditor, blocksToRows, rowsToBlocks, type BlockRow } from './block-editor';

/** Soorten waarbij de opbouw (blokken) het belangrijkste deel van de training is. */
const STRUCTURED: Kind[] = ['threshold', 'interval', 'tempo', 'sets'];

/**
 * Invulscherm van één training. Kracht is alleen afvinken: die sessies worden
 * niet met het horloge opgenomen, dus tijd, hartslag en RPE zeggen er niets.
 */
export function WorkoutModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, saveWorkout, deleteWorkout, setEditing } = useStore();
  const w = state.workouts[id];

  const [done, setDone] = useState(false);
  const [kind, setKind] = useState<Kind>('easy');
  const [tijd, setTijd] = useState('');
  const [gemHr, setGemHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [afstand, setAfstand] = useState('');
  const [snelheid, setSnelheid] = useState('');
  const [hoogte, setHoogte] = useState('');
  const [vermogen, setVermogen] = useState('');
  const [rpe, setRpe] = useState(5);
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [bft, setBft] = useState('');
  const [windDir, setWindDir] = useState<WindDir | ''>('');
  const [headKm, setHeadKm] = useState('');
  const [indoor, setIndoor] = useState(false);
  const [datum, setDatum] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  // formulier vullen zodra we weten om welke training het gaat
  useEffect(() => {
    if (!w) return;
    const s = w.stats || {};
    setDone(!!s.done);
    setKind(plannedKind(state, w));
    setTijd(s.tijdMin ? fmtTijd(s.tijdMin) : '');
    setGemHr(s.gemHr != null ? String(s.gemHr) : '');
    setMaxHr(s.maxHr != null ? String(s.maxHr) : '');
    setAfstand(s.afstand != null ? String(s.afstand) : '');
    setSnelheid(
      s.snelheid != null
        ? TYPES[w.type]?.cat === 'fiets'
          ? String(s.snelheid)
          : fmtPace(s.snelheid)
        : ''
    );
    setHoogte(s.hoogte != null ? String(s.hoogte) : '');
    setVermogen(s.vermogen != null ? String(s.vermogen) : '');
    setRpe(s.rpe ?? 5);
    setRows(blocksToRows(w.structure, w.type));
    setBft(w.wind?.bft != null ? String(w.wind.bft) : '');
    setWindDir(w.wind?.dir ?? '');
    setHeadKm(w.wind?.headKm != null ? String(w.wind.headKm) : '');
    setIndoor(!!w.indoor);
    setDatum(w.date);
    setConfirmDel(false);
  }, [id, w]);

  // achtergrondverversing mag niet over dit formulier heen walsen
  useEffect(() => {
    setEditing(true);
    return () => setEditing(false);
  }, [setEditing]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const t = w ? TYPES[w.type] : null;

  const berekend = useMemo(() => {
    if (!w || !t || t.cat === 'kracht') return '';
    const tm = parseTijd(tijd);
    const af = parseNum(afstand);
    if (!tm || !af) return '';
    const v =
      t.cat === 'run' ? tm / af : t.cat === 'fiets' ? af / (tm / 60) : tm / (af / 100);
    return 'berekend: ' + fmtSpeed(v, w.type);
  }, [tijd, afstand, w, t]);

  if (!w || !t) return null;

  const isKracht = t.cat === 'kracht';
  // zonder eigen keuze: wat het weekadvies voor deze training aanraadt
  const advisedKind = plannedKind(state, w);
  const fromGarmin = w.source === 'icu';
  const autoWind = w.wind?.source === 'auto';
  const d = fromIso(w.date);
  // het voorschrift volgt de soort die nu in de modal gekozen is
  const plan = isKracht ? null : prescribe(state, { ...w, kind });
  const verdict = plan && w.stats?.done ? compliance(w, plan) : null;

  const speedLabel =
    t.cat === 'fiets'
      ? 'Snelheid (km/u)'
      : t.cat === 'zwem'
        ? 'Tempo (min/100m, bv. 2:10)'
        : 'Tempo (min/km, bv. 5:30)';
  const afstLabel = t.cat === 'zwem' ? 'Afstand (meter)' : 'Afstand (km)';

  function submit() {
    if (isKracht) {
      // oude waarden blijven in de database staan, alleen het vinkje telt
      saveWorkout(id, { stats: { ...w!.stats, done }, date: datum || w!.date });
      onClose();
      return;
    }

    const stats: Stats = {
      done,
      tijdMin: parseTijd(tijd),
      gemHr: parseNum(gemHr),
      maxHr: parseNum(maxHr),
      rpe,
      afstand: parseNum(afstand),
      snelheid: parseSpeed(snelheid, w!.type)
    };
    if (t!.cat !== 'zwem') stats.hoogte = parseNum(hoogte);
    if (t!.cat === 'fiets') stats.vermogen = parseNum(vermogen);

    let wind: Wind | null = w!.wind ?? null;
    if (t!.cat === 'fiets' && indoor) {
      wind = null; // binnen: geen wind
    } else if (t!.cat === 'fiets' && !autoWind) {
      const b = parseNum(bft);
      wind =
        b == null && !windDir
          ? null
          : { source: 'manual', bft: b, dir: windDir || null, headKm: parseNum(headKm) };
    }

    saveWorkout(id, {
      stats,
      // alleen vastleggen als je zelf iets anders kiest dan het advies; anders
      // blijft de training het weekadvies volgen
      kind: w!.kind || kind !== advisedKind ? kind : null,
      structure: rowsToBlocks(rows, w!.type),
      wind,
      indoor: t!.cat === 'fiets' ? indoor : null,
      date: datum || w!.date
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,20,30,.55)] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t.label} invullen`}
        className="max-h-[92vh] w-full max-w-[520px] overflow-auto rounded-im-card bg-white p-5"
      >
        <h3 className="text-[1.05rem] font-bold">
          {t.label}{' '}
          <span className="text-[.75rem] font-normal text-im-muted">
            {NAMES[w.person]} · {d.getDate()} {MONTH_NAMES[d.getMonth()]}
            {fromGarmin && ' · ⌚ uit Garmin'}
          </span>
        </h3>
        {t.sub && <div className="mb-3 text-[.8rem] text-im-muted">{t.sub}</div>}

        {plan && (
          <div className="mb-3 rounded-im-ctl bg-[#f0f4f8] px-3 py-2.5 text-[.85rem]">
            <div className="flex items-baseline justify-between gap-2">
              <span>
                🎯 <b>{plan.summary}</b>
              </span>
              <span className="shrink-0 text-[.7rem] uppercase tracking-[.5px] text-im-muted">
                {WEEK_LABEL[plan.weekKind]}
              </span>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-[.8rem] leading-snug text-[#334]">
              {plan.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {plan.missing && (
              <p className="mt-1.5 text-[.75rem] font-semibold text-im-warn">{plan.missing}</p>
            )}
            {plan.basis.length > 0 && (
              <p className="mt-1.5 text-[.72rem] text-im-muted">
                Gebaseerd op: {plan.basis.slice(0, 3).join(' · ')}
              </p>
            )}
            {verdict && (
              <p
                className={`mt-1.5 text-[.8rem] font-semibold ${
                  verdict.verdict === 'hit'
                    ? 'text-im-good'
                    : verdict.verdict === 'close'
                      ? 'text-im-warn'
                      : 'text-im-bad'
                }`}
              >
                {verdict.verdict === 'hit' ? '✓ Gehaald' : verdict.verdict === 'close' ? '≈ Bijna' : '✗ Niet gehaald'}
                {': '}
                {verdict.notes.join(' · ')}
              </p>
            )}
            {!!plan.blocks?.length && rows.length === 0 && (
              <button
                onClick={() => setRows(blocksToRows(plan.blocks, w.type))}
                className="mt-2 rounded-im-ctl border border-im-line bg-white px-2.5 py-1 text-[.75rem] font-semibold hover:border-im-ink"
              >
                📋 Voorschrift als opbouw overnemen
              </button>
            )}
          </div>
        )}

        <label className="mb-2.5 flex items-center gap-2 text-[.9rem] font-semibold">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="h-[18px] w-[18px]"
          />
          Training gedaan
        </label>

        {!isKracht && (
          <>
            <div className="mb-2.5">
              <div className="mb-1 text-[.74rem] font-bold uppercase tracking-[.5px] text-im-muted">
                Soort training
                {!w.kind && (
                  <span className="ml-1.5 font-normal normal-case tracking-normal">
                    · 💡 volgt het weekadvies tot je zelf kiest
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Soort training">
                {KINDS[t.cat].map((k) => (
                  <button
                    key={k.kind}
                    role="radio"
                    aria-checked={kind === k.kind}
                    onClick={() => setKind(k.kind)}
                    className={`rounded-full border px-3 py-1 text-[.8rem] font-semibold ${
                      kind === k.kind
                        ? 'border-im-ink bg-im-ink text-white'
                        : 'border-im-line text-im-ink hover:border-im-ink'
                    }`}
                  >
                    {k.label}
                    {!w.kind && k.kind === advisedKind && (
                      <span className="ml-1 font-normal opacity-80" title="aangeraden in het weekadvies">
                        💡
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {(STRUCTURED.includes(kind) || rows.length > 0) && (
              <BlockEditor rows={rows} onChange={setRows} type={w.type} />
            )}

            <Field label="Behaalde tijd (mm:ss of h:mm:ss)">
              <input
                value={tijd}
                onChange={(e) => setTijd(e.target.value)}
                inputMode="numeric"
                placeholder="bv. 45:00"
                className={INPUT}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Gem. hartslag">
                <input
                  value={gemHr}
                  onChange={(e) => setGemHr(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="bv. 150"
                  className={INPUT}
                />
              </Field>
              <Field label="Max. hartslag">
                <input
                  value={maxHr}
                  onChange={(e) => setMaxHr(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="bv. 178"
                  className={INPUT}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label={afstLabel}>
                <input
                  value={afstand}
                  onChange={(e) => setAfstand(e.target.value)}
                  inputMode="decimal"
                  placeholder={t.cat === 'zwem' ? 'bv. 1500' : 'bv. 10'}
                  className={INPUT}
                />
              </Field>
              <Field label={speedLabel}>
                <input
                  value={snelheid}
                  onChange={(e) => setSnelheid(e.target.value)}
                  inputMode="decimal"
                  placeholder="auto"
                  className={INPUT}
                />
                {berekend && (
                  <div className="mt-1 text-[.75rem] text-im-muted">{berekend}</div>
                )}
              </Field>
            </div>

            {t.cat !== 'zwem' && (
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Hoogtemeters (m)">
                  <input
                    value={hoogte}
                    onChange={(e) => setHoogte(e.target.value)}
                    type="number"
                    inputMode="numeric"
                    placeholder="Garmin"
                    className={INPUT}
                  />
                </Field>
                {t.cat === 'fiets' && (
                  <Field label="Gem. vermogen (W)">
                    <input
                      value={vermogen}
                      onChange={(e) => setVermogen(e.target.value)}
                      type="number"
                      inputMode="numeric"
                      placeholder="Garmin"
                      className={INPUT}
                    />
                  </Field>
                )}
              </div>
            )}

            {t.cat === 'fiets' && (
              <label className="mb-2.5 flex items-center gap-2 text-[.9rem] font-semibold">
                <input
                  type="checkbox"
                  checked={indoor}
                  onChange={(e) => setIndoor(e.target.checked)}
                  className="h-[18px] w-[18px]"
                />
                🏠 Binnen (hometrainer)
                <span className="text-[.75rem] font-normal text-im-muted">
                  geen wind; snelheid telt niet mee, vermogen wel
                </span>
              </label>
            )}

            {t.cat === 'fiets' &&
              !indoor &&
              (autoWind ? (
                <div className="mb-2.5 rounded-im-ctl bg-[#f0f4f8] px-2.5 py-2 text-[.85rem]">
                  💨 {w.wind?.bft != null && <>{w.wind.bft} Bft · </>}
                  {w.wind?.headKm != null && <>{Math.round(w.wind.headKm)} km tegen · </>}
                  {w.wind?.tailKm != null && <>{Math.round(w.wind.tailKm)} km mee</>}
                  <span className="block text-[.72rem] text-im-muted">
                    automatisch uit het weer tijdens je rit
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  <Field label="Wind (Bft)">
                    <select value={bft} onChange={(e) => setBft(e.target.value)} className={INPUT}>
                      <option value="">—</option>
                      {Array.from({ length: 9 }, (_, i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Vooral">
                    <select
                      value={windDir}
                      onChange={(e) => setWindDir(e.target.value as WindDir | '')}
                      className={INPUT}
                    >
                      <option value="">—</option>
                      <option value="tegen">tegen</option>
                      <option value="mee">mee</option>
                      <option value="zij">zij</option>
                      <option value="wisselend">wisselend</option>
                    </select>
                  </Field>
                  <Field label="Km tegenwind">
                    <input
                      value={headKm}
                      onChange={(e) => setHeadKm(e.target.value)}
                      inputMode="decimal"
                      placeholder="bv. 20"
                      className={INPUT}
                    />
                  </Field>
                </div>
              ))}

            <Field label={`Hoe zwaar? ${rpe}/10`}>
              <input
                type="range"
                min={1}
                max={10}
                value={rpe}
                onChange={(e) => setRpe(Number(e.target.value))}
                className="w-full"
              />
            </Field>
          </>
        )}

        <Field label="Verplaatsen naar">
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className={INPUT}
          />
        </Field>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="min-h-[42px] shrink-0 rounded-[9px] bg-[#e8ecf0] px-3.5 font-bold"
          >
            Sluit
          </button>
          <button
            onClick={() => {
              if (!confirmDel) return setConfirmDel(true);
              deleteWorkout(id);
              onClose();
            }}
            className="min-h-[42px] shrink-0 rounded-[9px] bg-[#fbe3e3] px-3.5 font-bold text-im-bad"
            aria-label="Training verwijderen"
          >
            {confirmDel ? 'Zeker weten?' : '🗑'}
          </button>
          <button
            onClick={submit}
            className="min-h-[42px] flex-1 rounded-[9px] bg-im-ink font-bold text-white"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-im-ctl border border-im-line px-2.5 py-2 text-[.95rem] outline-none focus:border-im-accent focus:ring-2 focus:ring-im-accent/25';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-2.5 block">
      <span className="mb-1 block text-[.74rem] font-bold uppercase tracking-[.5px] text-im-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
