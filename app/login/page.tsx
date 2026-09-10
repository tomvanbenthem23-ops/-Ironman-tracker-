'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Inloggen mislukt');
        return;
      }
      router.push(params.get('from') || '/');
      router.refresh();
    } catch {
      setError('Inloggen mislukt — probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-im-bg px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-[380px] rounded-im-card bg-white p-8 shadow-im-card"
      >
        <div className="mb-5 rounded-im-day bg-im-navy px-4 py-3 text-white">
          <div className="text-[15px] font-bold tracking-wide">
            🏊🚴🏃 IRONMAN 70.3 VALENCIA
          </div>
          <div className="mt-0.5 text-[12px] text-im-navy-soft">
            Zondag 18 april 2027 · doel: onder de 5 uur
          </div>
        </div>

        <h1 className="mb-1.5 text-[18px] font-bold text-im-ink">Inloggen</h1>
        <p className="mb-5 text-[13px] text-im-muted">
          Vul het gedeelde wachtwoord in om bij de tracker te komen.
        </p>

        <label
          htmlFor="password"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-im-muted"
        >
          Wachtwoord
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-im-ctl border border-im-line px-3 py-2 text-[15px] outline-none focus:border-im-accent focus:ring-2 focus:ring-im-accent/25"
        />

        {error && (
          <p className="mb-3 text-[13px] font-semibold text-im-bad">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-im-ctl bg-im-ink px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Inloggen'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
