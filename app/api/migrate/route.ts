import { NextResponse } from 'next/server';
import { counts, migrate } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1'; // Frankfurt: naast de Neon-database

/**
 * Brengt de database op het huidige schema. Idempotent — na elke deploy die
 * het schema uitbreidt één keer openen. Geeft de tellingen terug, zodat je
 * ziet dat er niets verloren ging.
 */
export async function GET() {
  try {
    await migrate();
    return NextResponse.json({ ok: true, message: 'Schema bijgewerkt.', counts: await counts() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
