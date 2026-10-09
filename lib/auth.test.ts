import { describe, expect, it } from 'vitest';
import { authToken, safeNext } from './auth';

describe('inlogcookie', () => {
  it('bevat een afgeleide sleutel, niet het wachtwoord', async () => {
    const t = await authToken('geheim');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toContain('geheim');
    expect(await authToken('geheim')).toBe(t);
    expect(await authToken('anders')).not.toBe(t);
  });
});

describe('safeNext', () => {
  it('stuurt alleen terug naar een pagina van de tracker zelf', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/privacy')).toBe('/privacy');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext(String.raw`/\evil.example`)).toBe('/'); // browsers lezen /\ als //
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
