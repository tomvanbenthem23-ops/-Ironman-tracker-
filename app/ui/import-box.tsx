'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';

/**
 * Eenmalige overstap vanaf de oude losse HTML-tracker: het exportbestand
 * daarvan gaat hier naar binnen. Bewust klein en onderaan — je gebruikt dit
 * één keer.
 */
export function ImportBox() {
  const { importJson } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const raw = JSON.parse(await file.text());
      const res = await importJson(raw);
      setMsg({ ok: res.ok, text: res.message });
    } catch {
      setMsg({ ok: false, text: 'Dat bestand kon ik niet lezen.' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <footer className="px-4 pb-10 sm:px-6">
      <details className="rounded-im-day bg-im-card p-3 text-[.78rem] text-im-muted shadow-im-day">
        <summary className="cursor-pointer font-semibold text-im-ink">
          ⬆️ Data uit de oude tracker inlezen
        </summary>
        <p className="mt-1.5 leading-relaxed">
          Draai in de oude <code>ironman-tracker.html</code> de export-knop en
          kies dat bestand hier. Inlezen kan geen kwaad: trainingen met hetzelfde
          id worden overschreven, de rest blijft staan. Je kunt dus eerst Toms
          bestand en daarna dat van Quirijn inlezen.
        </p>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="mt-2 block text-[.78rem]"
        />
        {busy && <p className="mt-1.5">Bezig met inlezen…</p>}
        {msg && (
          <p className={`mt-1.5 font-semibold ${msg.ok ? 'text-im-good' : 'text-im-bad'}`}>
            {msg.text}
          </p>
        )}
      </details>
    </footer>
  );
}
