import { NextRequest, NextResponse } from 'next/server';
import { authToken, COOKIE_NAME } from '@/lib/auth';

// zonder inloggen bereikbaar: het inlogscherm, de privacyverklaring en de iconen
const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/privacy',
  '/favicon',
  '/apple-touch-icon',
  '/icon',
  '/manifest.webmanifest',
  '/robots.txt'
];

export async function middleware(req: NextRequest) {
  const password = process.env.IM_PASSWORD;
  if (!password) return NextResponse.next(); // geen wachtwoord ingesteld -> hek staat open

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // de dagelijkse Vercel Cron heeft geen cookie, wel CRON_SECRET
  const cron = process.env.CRON_SECRET;
  if (
    pathname === '/api/sync' &&
    cron &&
    req.headers.get('authorization') === `Bearer ${cron}`
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === (await authToken(password)))
    return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
