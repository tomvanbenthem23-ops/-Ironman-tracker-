'use client';

import Link from 'next/link';

/**
 * Onderaan elke pagina. Client-side, zodat het jaartal in de browser wordt
 * bepaald: de pagina's worden vooraf gebouwd, anders bleef het bouwjaar staan.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto px-6 py-5 text-[.78rem] text-im-muted">
      © {new Date().getFullYear()} Tom &amp; Quirijn ·{' '}
      <Link
        href="/privacy"
        className="underline underline-offset-2 hover:text-im-ink"
      >
        Privacy
      </Link>
    </footer>
  );
}
