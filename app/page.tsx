export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-5 py-10">
      <div className="rounded-im-card bg-im-navy px-6 py-5 text-white shadow-im-card">
        <h1 className="text-[1.35rem] font-bold tracking-wide">
          🏊🚴🏃 IRONMAN 70.3 VALENCIA
        </h1>
        <p className="mt-1 text-[.8rem] text-im-navy-soft">
          Zondag 18 april 2027 · doel: onder de 5 uur
        </p>
      </div>

      <div className="mt-4 rounded-im-card bg-white p-6 shadow-im-card">
        <h2 className="text-[.78rem] font-semibold uppercase tracking-[1px] text-im-muted">
          Steiger
        </h2>
        <p className="mt-3 text-[.95rem] leading-relaxed">
          Deze app is nog niet gebouwd. Het casco staat klaar: gedeeld
          wachtwoord, database, API-routes en de designtokens. De app zelf wordt
          gebouwd op basis van <code>IRONMAN_PROMPT.md</code> in de root van dit
          project.
        </p>
        <ul className="mt-4 space-y-1.5 text-[.9rem] text-im-muted">
          <li>
            <code className="text-im-ink">GET /api/migrate</code> — maakt de
            tabellen aan (eenmalig, na de eerste deploy)
          </li>
          <li>
            <code className="text-im-ink">GET /api/state</code> — hele state
            ophalen
          </li>
          <li>
            <code className="text-im-ink">POST /api/state</code> — training,
            weekteller of Garmin-record opslaan, of een oude export importeren
          </li>
        </ul>
      </div>
    </main>
  );
}
