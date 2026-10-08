import { BLOCK_START, DEFAULT_KIND, PHASE2_FROM, TYPES } from './config';
import { addDays, catOf, fmtPace, fromIso, iso, kindOf, weekKeyOf } from './calc';
import { anchors, readiness } from './fitness';
import { goalView, RATES } from './goal';
import { paletteTypeFor } from './icu-map';
import { buildStep, prescribe, weekKind } from './prescribe';
import type { Discipline, Kind, Person, State, WeekKind, Workout } from './types';

/**
 * Weekadvies: welke trainingen je deze week het best doet, per discipline in
 * volgorde van belang. Puur; geen UI.
 *
 * Uitgangspunten:
 * - lange sessies staan vast (long run, lange rit, doorzwemmen tot de
 *   race-afstand gehaald is): zonder die basis haal je de finish niet in tempo;
 * - per discipline hooguit één kwaliteitstraining, de rest rustig (80/20);
 * - de kwaliteit gaat naar wat 5:00 vraagt (goal.ts): zwemsets alleen als je
 *   CSS nog niet op niveau is, anders doorzwemmen;
 * - afwisseling: threshold en interval wisselen per opbouwweek af, op de fiets
 *   in fase 2 ook tempo en interval;
 * - rustweek alles rustig, taper kort met korte prikkels, raceweek fris.
 * Het advies rekent met je fitheid tot de maandag van die week, zodat het de
 * hele week hetzelfde blijft.
 *
 * Geplande trainingen zonder eigen gekozen soort volgen het advies; wie in een
 * training zelf een soort kiest, gaat voor.
 */

export type Cat = Exclude<Discipline, 'kracht'>;
export const CATS: Cat[] = ['run', 'fiets', 'zwem'];

export type AdvisedSession = {
  cat: Cat;
  kind: Kind;
  /** De belangrijkste training van de week. */
  key: boolean;
  why: string;
  /** Het voorschrift, zoals het op het kaartje zou staan. */
  summary: string | null;
};

export type WeekAdvice = {
  monday: string;
  weekKind: WeekKind;
  focus: string;
  /** Per discipline zoveel als we aanraden, in volgorde van belang. */
  sessions: AdvisedSession[];
  tips: string[];
  /** Aantal geplande trainingen per discipline (gedaan of niet). */
  planned: Record<Cat, number>;
  advised: Record<Cat, number>;
  /** Training-id → aangeraden soort, voor trainingen zonder eigen keuze. */
  assigned: Record<string, Kind>;
};

/** Hoeveel trainingen per discipline we per week aanraden. */
export const WEEK_COUNTS = {
  phase1: { run: 2, fiets: 2, zwem: 2 },
  phase2: { run: 3, fiets: 3, zwem: 2 }
} as const;

/** Wat een extra training (boven het advies) wordt: altijd rustig. */
const EXTRA: Record<Cat, Kind> = { run: 'easy', fiets: 'endurance', zwem: 'continuous' };

const QUALITY: Kind[] = ['threshold', 'interval', 'tempo', 'sets'];

const LEG: Record<Cat, 'run' | 'fiets' | 'zwem'> = { run: 'run', fiets: 'fiets', zwem: 'zwem' };
const LEG_NAME: Record<Cat, string> = { run: 'lopen', fiets: 'fietsen', zwem: 'zwemmen' };

const fmtNl = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const fmtM = (m: number) => Math.round(m).toLocaleString('nl-NL');

/** Welke soorten, in volgorde van belang, per discipline. */
export function kindLists(
  wk: WeekKind,
  step: number,
  phase2: boolean,
  r: { bikeLongKm: number; swimLongM: number },
  swimNeedsSpeed: boolean
): Record<Cat, Kind[]> {
  if (wk === 'rest') {
    return {
      run: ['long', 'easy', 'easy'],
      fiets: ['endurance', 'endurance', 'endurance'],
      zwem: ['continuous', 'continuous']
    };
  }
  if (wk === 'taper') {
    return {
      run: ['threshold', 'long', 'easy'],
      fiets: ['tempo', 'endurance', 'endurance'],
      zwem: ['sets', 'continuous']
    };
  }
  if (wk === 'race') {
    return {
      run: ['easy', 'easy', 'easy'],
      fiets: ['endurance', 'endurance', 'endurance'],
      zwem: ['continuous', 'continuous']
    };
  }
  const runQ: Kind = step % 2 === 0 ? 'threshold' : 'interval';
  const bikeQ: Kind = phase2 && step % 2 === 1 ? 'interval' : 'tempo';
  return {
    run: ['long', runQ, 'easy'],
    // zolang de lange rit nog ver van 90 km is, gaat die voor
    fiets: r.bikeLongKm < 75 ? ['endurance', bikeQ, 'endurance'] : [bikeQ, 'endurance', 'endurance'],
    zwem: swimNeedsSpeed
      ? ['sets', 'continuous']
      : r.swimLongM < 1900
        ? ['continuous', 'sets']
        : ['sets', 'continuous']
  };
}

/**
 * Verdeelt de aangeraden soorten over de geplande trainingen van een
 * discipline. Een zelf gekozen soort neemt zijn plek in; daarna krijgt een
 * training eerst de soort die bij zijn type hoort (Lange run → long), en de
 * rest de volgende in de lijst (een korte run liefst geen long run). Meer
 * trainingen dan geadviseerd: rustig.
 */
export function assignKinds(list: Kind[], ws: Workout[], cat: Cat): Record<string, Kind> {
  const sorted = [...ws].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  const remaining = [...list];
  const take = (k: Kind) => {
    const i = remaining.indexOf(k);
    if (i < 0) return false;
    remaining.splice(i, 1);
    return true;
  };
  for (const w of sorted) if (w.kind) take(w.kind);
  const out: Record<string, Kind> = {};
  const free = sorted.filter((w) => !w.kind);
  for (const w of free) {
    const own = DEFAULT_KIND[w.type];
    if (own && take(own)) out[w.id] = own;
  }
  for (const w of free) {
    if (out[w.id]) continue;
    // een korte run wordt geen long run zolang er iets anders over is: die
    // plan je meestal juist omdat je weinig tijd hebt
    const i = DEFAULT_KIND[w.type] !== 'long' ? remaining.findIndex((k) => k !== 'long') : 0;
    out[w.id] = (i >= 0 ? remaining.splice(i, 1)[0] : remaining.shift()) ?? EXTRA[cat];
  }
  return out;
}

const cache = new WeakMap<State, Map<string, WeekAdvice | null>>();

export function weekAdvice(state: State, person: Person, monday: string): WeekAdvice | null {
  let byKey = cache.get(state);
  if (!byKey) cache.set(state, (byKey = new Map()));
  const k = `${person}|${monday}`;
  if (!byKey.has(k)) byKey.set(k, computeAdvice(state, person, monday));
  return byKey.get(k)!;
}

function computeAdvice(state: State, person: Person, monday: string): WeekAdvice | null {
  const mon = fromIso(monday);
  if (mon < BLOCK_START) return null; // september: warm-up, geen advies

  const wk = weekKind(state, mon);
  const step = buildStep(state, mon);
  const phase2 = mon >= PHASE2_FROM;
  const a = anchors(state, person, monday);
  const r = readiness(state, person, monday);
  const g = goalView(state, person, monday);
  const legOf = (c: Cat) => g.legs.find((l) => l.key === LEG[c])!;
  const swimNeedsSpeed = legOf('zwem').verdict !== 'met';

  const lists = kindLists(wk, step, phase2, r, swimNeedsSpeed);
  const counts = phase2 ? WEEK_COUNTS.phase2 : WEEK_COUNTS.phase1;

  // wat 5:00 het meest vraagt: daar zit de belangrijkste training
  const score = (c: Cat) => {
    const l = legOf(c);
    if (l.perWeek == null) return 0.5;
    return l.perWeek / RATES[l.key].ambitious;
  };
  const limiter = [...CATS].sort((x, y) => score(y) - score(x))[0];
  const limiterGap = (legOf(limiter).perWeek ?? 0) > 0;

  const sessions: AdvisedSession[] = [];
  for (const c of CATS) {
    const ks = lists[c].slice(0, counts[c]);
    ks.forEach((kind, i) => {
      const key =
        wk === 'build' &&
        ((limiterGap && c === limiter && QUALITY.includes(kind) && !sessions.some((s) => s.key)) ||
          (!limiterGap && c === 'fiets' && kind === 'endurance' && i === 0));
      sessions.push({
        cat: c,
        kind,
        key,
        why: whyOf(c, kind, wk, a, r, legOf(c)),
        summary: summaryOf(state, person, mon, c, kind)
      });
    });
  }

  // geplande trainingen van deze week
  const end = iso(addDays(mon, 7));
  const week = Object.values(state.workouts).filter(
    (w) => w.person === person && w.date >= monday && w.date < end && TYPES[w.type]
  );
  const planned = { run: 0, fiets: 0, zwem: 0 } as Record<Cat, number>;
  let assigned: Record<string, Kind> = {};
  for (const c of CATS) {
    const ws = week.filter((w) => catOf(w) === c);
    planned[c] = ws.length;
    assigned = { ...assigned, ...assignKinds(lists[c], ws, c) };
  }

  return {
    monday,
    weekKind: wk,
    focus: focusOf(wk, limiter, limiterGap, legOf(limiter).perWeek, sessions),
    sessions,
    tips: tipsOf(wk, phase2, r),
    planned,
    advised: { ...counts },
    assigned
  };
}

/** De soort waarmee een training gecoacht wordt: zelf gekozen, anders het weekadvies. */
export function plannedKind(state: State, w: Workout): Kind {
  if (w.kind) return w.kind;
  if (catOf(w) === 'kracht') return kindOf(w);
  const adv = weekAdvice(state, w.person, weekKeyOf(w.date));
  return adv?.assigned[w.id] ?? kindOf(w);
}

/* ---------- teksten ---------- */

export const KIND_ADVICE_LABEL: Record<Kind, string> = {
  long: 'Long run',
  easy: 'Easy run',
  threshold: 'Threshold-run',
  interval: 'Intervalrun',
  endurance: 'Duurrit',
  tempo: 'Tempo-rit',
  continuous: 'Doorzwemmen',
  sets: 'Zwemsets',
  strength: 'Kracht'
};

function whyOf(
  c: Cat,
  kind: Kind,
  wk: WeekKind,
  a: ReturnType<typeof anchors>,
  r: ReturnType<typeof readiness>,
  leg: ReturnType<typeof goalView>['legs'][number]
): string {
  if (wk === 'rest') return 'Rustweek: rustig en korter, zodat je de opbouw van drie weken verwerkt.';
  if (wk === 'race') return 'Raceweek: kort en ontspannen, fris aan de start.';
  const taper = wk === 'taper' ? ' Taper: korter, intensiteit blijft.' : '';
  switch (kind) {
    case 'long':
      return `Duurvermogen voor de 21,1 km na 90 km fietsen. Langste run nu ${fmtNl(r.runLongKm)} km.${taper}`;
    case 'threshold':
      return (
        (a.runThreshold
          ? `Tilt je drempeltempo: nu ${fmtPace(a.runThreshold.value)} /km, 5:00 vraagt 4:15.`
          : 'Geeft meteen je eerste drempelmeting.') + taper
      );
    case 'interval':
      return c === 'fiets'
        ? 'Korte blokken boven je drempel verhogen je plafond. Wisselt af met de tempo-rit.'
        : 'Korte, harde herhalingen verhogen je VO2max en trekken je drempel mee. Wisselt af met threshold.';
    case 'easy':
      return 'Herstel en extra volume in zone 2.';
    case 'endurance':
      return `Langste rit nu ${Math.round(r.bikeLongKm)} km; de race is 90 km. Elke opbouwweek iets langer.${taper}`;
    case 'tempo':
      return (
        (leg.now != null && leg.unit === 'kmh'
          ? `Fietsvermogen omhoog: duursnelheid nu ${fmtNl(leg.now)} km/u, 5:00 vraagt ${fmtNl(leg.need)}.`
          : leg.now != null && leg.unit === 'watt'
            ? `Fietsvermogen omhoog: FTP nu ${Math.round(leg.now)} W, 5:00 vraagt ±${Math.round(leg.need)} W.`
            : 'Fietsvermogen omhoog: blokken net onder je drempel.') + taper
      );
    case 'sets':
      return (
        (a.css
          ? leg.verdict === 'met'
            ? `Houdt je CSS (${fmtPace(a.css.value)} /100m) scherp.`
            : `Zwemtempo omhoog: CSS nu ${fmtPace(a.css.value)} /100m, 5:00 vraagt 1:55.`
          : 'Geeft meteen je eerste CSS-meting.') + taper
      );
    case 'continuous':
      return `Uithoudingsvermogen in het water: langste sessie nu ${fmtM(r.swimLongM)} m, de race is 1.900 m aan één stuk.`;
    default:
      return '';
  }
}

function focusOf(
  wk: WeekKind,
  limiter: Cat,
  limiterGap: boolean,
  perWeek: number | null,
  sessions: AdvisedSession[]
): string {
  if (wk === 'rest')
    return 'Rustweek: alles rustig en ongeveer een derde korter. Hier word je sterker van de afgelopen drie weken; niet inhalen.';
  if (wk === 'taper') return 'Taper: minder volume, korte prikkels op racetempo. Je wordt nu niet fitter, wel frisser.';
  if (wk === 'race') return 'Raceweek: kort en rustig, een paar versnellingen op racetempo, veel slapen.';
  const key = sessions.find((s) => s.key);
  if (limiterGap && key) {
    return `5:00 vraagt het meest bij het ${LEG_NAME[limiter]}${
      perWeek ? ` (+${fmtNl(perWeek * 100, 2)}% per week)` : ''
    }: de ${KIND_ADVICE_LABEL[key.kind].toLowerCase()} is je belangrijkste training deze week. Die sla je niet over.`;
  }
  return 'Je ligt op koers voor 5:00: houd de balans, en bouw de lange sessies verder op.';
}

function tipsOf(wk: WeekKind, phase2: boolean, r: ReturnType<typeof readiness>): string[] {
  const tips: string[] = [];
  if (wk === 'build' && r.bricks < 3) {
    tips.push(
      phase2
        ? `Brick: loop direct na je tempo-rit 20 min op racegevoel. In de laatste 8 weken: ${r.bricks}.`
        : `Brick: loop direct na je lange rit 10–15 min rustig. In de laatste 8 weken: ${r.bricks}; de race vraagt het.`
    );
  }
  if (wk === 'build') tips.push('Twee harde trainingen niet op opeenvolgende dagen; daartussen rustig of rust.');
  return tips;
}

/** Het voorschrift van een aangeraden training, alsof die op zaterdag van die week staat. */
function summaryOf(state: State, person: Person, mon: Date, c: Cat, kind: Kind): string | null {
  const minutes = kind === 'endurance' ? 100 : 60;
  const date = iso(addDays(mon, 5));
  const type = paletteTypeFor(c, kind, date, minutes);
  const p = prescribe(state, { id: `advies-${c}-${kind}`, person, type, date, kind, stats: {} });
  return p?.summary ?? null;
}

export const isQuality = (k: Kind) => QUALITY.includes(k);
