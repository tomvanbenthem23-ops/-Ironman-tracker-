import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'im_auth';
const PUBLIC_PATHS = ['/login', '/api/login'];

export function middleware(req: NextRequest) {
  const password = process.env.IM_PASSWORD;
  if (!password) return NextResponse.next(); // geen wachtwoord ingesteld -> hek staat open

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === password) return NextResponse.next();

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
