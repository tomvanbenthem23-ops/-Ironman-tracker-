import { NextResponse } from 'next/server';
import { migrate } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1'; // Frankfurt: naast de Neon-database

/**
 * Eenmalig aanroepen na de eerste deploy: maakt de tabellen aan.
 * Idempotent — nog een keer draaien kan geen kwaad.
 */
export async function GET() {
  try {
    await migrate();
    return NextResponse.json({ ok: true, message: 'Tabellen staan klaar.' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
