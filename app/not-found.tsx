import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from './ui/site-footer';

export const metadata: Metadata = {
  title: 'Pagina niet gevonden',
  description:
    'Deze pagina bestaat niet in de trainingstracker voor de Ironman 70.3 Valencia.'
};

/** Eigen 404: Next.js geeft hierbij ook echt status 404 terug. */
export default function NotFound() {
  return (
    <>
      <header className="bg-im-navy px-6 py-4 text-white">
        <Link
          href="/"
          className="inline-block rounded-im-ctl text-[1.35rem] font-bold tracking-[.5px] hover:opacity-90"
        >
          🏊🚴🏃 IRONMAN 70.3 VALENCIA
          <small className="mt-0.5 block text-[.8rem] font-normal text-im-navy-soft">
            Zondag 18 april 2027 · doel: onder de 5 uur
          </small>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[460px] rounded-im-card bg-white p-8 text-center shadow-im-card">
          <p className="text-[.78rem] font-bold uppercase tracking-[1px] text-im-muted">
            404
          </p>
          <h1 className="mt-1 text-[1.4rem] font-bold text-im-ink">
            Deze pagina bestaat niet
          </h1>
          <p className="mt-2 text-[.95rem] text-im-muted">
            Misschien is de link verkeerd overgenomen. Je trainingen staan
            gewoon in de agenda.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-im-ctl bg-im-ink px-5 text-[.95rem] font-bold text-white hover:bg-im-navy-2"
          >
            Naar de agenda
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
