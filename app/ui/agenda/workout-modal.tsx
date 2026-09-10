'use client';

import { useEffect, useMemo, useState } from 'react';
import { MONTH_NAMES, NAMES, TYPES } from '@/lib/config';
import {
  fmtPace,
  fmtSpeed,
  fmtTijd,
  fromIso,
  parseNum,
  parseSpeed,
  parseTijd,
  targetFor
} from '@/lib/calc';
import { useStore } from '@/lib/store';
import type { Stats } from '@/lib/types';

/**
 * Invulscherm van één training. Op een telefoon is dit een vel over het hele
 * scherm, op een desktop een dialoogvenster.
 */
export function WorkoutModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, saveWorkout, deleteWorkout, setEditing } = useStore();
  const w = state.workouts[id];

  const [done, setDone] = useState(false);
  const [tijd, setTijd] = useState('');
  const [gemHr, setGemHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [afstand, setAfstand] = useState('');
  const [snelheid, setSnelheid] = useState('');
  const [hoogte, setHoogte] = useState('');
  const [vermogen, setVermogen] = useState('');
  const [rpe, setRpe] = useState(5);
  const [datum, setDatum] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  // formulier vullen zodra we weten om welke training het gaat
  useEffect(() => {
    if (!w) return;
    const s = w.stats || {};
    setDone(!!s.done);
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
  const d = fromIso(w.date);
  const tgt = targetFor(state, w.person, w.type, w.date);

  const speedLabel =
    t.cat === 'fiets'
      ? 'Snelheid (km/u)'
      : t.cat === 'zwem'
        ? 'Tempo (min/100m, bv. 2:10)'
        : 'Tempo (min/km, bv. 5:30)';
  const afstLabel = t.cat === 'zwem' ? 'Afstand (meter)' : 'Afstand (km)';

  function submit() {
    const stats: Stats = {
      done,
      tijdMin: parseTijd(tijd),
      gemHr: parseNum(gemHr),
      maxHr: parseNum(maxHr),
      rpe
    };
    if (!isKracht) {
      stats.afstand = parseNum(afstand);
      stats.snelheid = parseSpeed(snelheid, w!.type);
      if (t!.cat !== 'zwem') stats.hoogte = parseNum(hoogte);
      if (t!.cat === 'fiets') stats.vermogen = parseNum(vermogen);
    }
    saveWorkout(id, { stats, date: datum || w!.date });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,20,30,.55)] p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t.label} invullen`}
        className="max-h-[95vh] w-full max-w-[420px] overflow-auto rounded-t-im-card bg-white p-5 sm:rounded-im-card"
      >
        <h3 className="text-[1.05rem] font-bold">
          {t.label}{' '}
          <span className="text-[.75rem] font-normal text-im-muted">
            {NAMES[w.person]} · {d.getDate()} {MONTH_NAMES[d.getMonth()]}
          </span>
        </h3>
        {t.sub && <div className="mb-3 text-[.8rem] text-im-muted">{t.sub}</div>}

        {tgt != null && (
          <div className="mb-3 rounded-im-ctl bg-[#f0f4f8] px-2.5 py-2 text-[.85rem]">
            🎯 Target deze week: <b>{fmtSpeed(tgt, w.type)}</b>
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

        {!isKracht && (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
          </>
        )}

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
