import { fmtDur, fmtPace, parseDistM, parseDurS, parseSpeed } from './calc';
import { TYPES } from './config';
import type { Block } from './types';

/**
 * Omzetting tussen de tekstvelden van de blokkeneditor en Blocks.
 * De editor werkt met tekst en zet pas bij opslaan om, zodat halve invoer
 * ("4:0") niet tussentijds wegspringt.
 */

export type BlockRow = {
  reps: string;
  work: string;
  speed: string;
  rest: string;
  actual: string;
};

export const emptyRow = (): BlockRow => ({ reps: '', work: '', speed: '', rest: '', actual: '' });

/** Tempo of snelheid als tekst in de eenheid van de discipline. */
function fmtUnit(v: number, type: string) {
  return TYPES[type]?.cat === 'fiets' ? String(Math.round(v * 10) / 10).replace('.', ',') : fmtPace(v);
}

export function blocksToRows(blocks: Block[] | null | undefined, type: string): BlockRow[] {
  return (blocks ?? []).map((b) => ({
    reps: String(b.reps ?? ''),
    work: b.workDistM
      ? `${Math.round(b.workDistM)} m`
      : b.workDurS
        ? fmtDur(b.workDurS)
        : '',
    speed: b.watts != null ? `${b.watts} W` : b.speed != null ? fmtUnit(b.speed, type) : '',
    rest: b.restDurS ? fmtDur(b.restDurS) : b.restDistM ? `${Math.round(b.restDistM)} m` : '',
    actual: (b.actual ?? [])
      .map((x) => (x != null ? fmtUnit(x, type) : '-'))
      .join(', ')
  }));
}

/** Rijen zonder herhalingen of werkdeel vallen weg; de rest wordt een Block. */
export function rowsToBlocks(rows: BlockRow[], type: string): Block[] {
  const out: Block[] = [];
  for (const r of rows) {
    const reps = parseInt(r.reps, 10);
    if (!reps || reps < 1 || !r.work.trim()) continue;

    // werkdeel: met "min", "s" of een dubbele punt is het tijd, anders afstand
    const isDur = /min|:|\d\s*s$/i.test(r.work.trim());
    const b: Block = { reps };
    if (isDur) b.workDurS = parseDurS(r.work);
    else b.workDistM = parseDistM(r.work);

    const sp = r.speed.trim();
    if (/w$/i.test(sp)) b.watts = parseInt(sp, 10) || null;
    else if (sp) b.speed = parseSpeed(sp, type);

    const rest = r.rest.trim().replace(/^[^\d]+/, ''); // "rust 1:30" → "1:30"
    if (rest) {
      if (/m$/i.test(rest) && !/min$/i.test(rest)) b.restDistM = parseDistM(rest);
      else b.restDurS = parseDurS(rest);
    }

    const act = r.actual
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (x === '-' ? null : parseSpeed(x, type)));
    if (act.length) b.actual = act;

    out.push(b);
  }
  return out;
}
