import { NextRequest, NextResponse } from 'next/server';

export const preferredRegion = 'fra1'; // Frankfurt: naast de Neon-database

const COOKIE_NAME = 'im_auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = process.env.IM_PASSWORD;

  if (!password) {
    return NextResponse.json({ ok: true }); // hek staat uit
  }
  if (!body || typeof body.password !== 'string' || body.password !== password) {
    return NextResponse.json({ error: 'Onjuist wachtwoord' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, password, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180 // een half jaar; de race is 18 april 2027
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
