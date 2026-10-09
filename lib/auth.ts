/**
 * Het inlogcookie. Daarin staat niet het gedeelde wachtwoord zelf, maar een
 * daarvan afgeleide sleutel (SHA-256), zodat het wachtwoord nooit in een
 * browser of verzoek terechtkomt. Werkt zowel in de middleware (edge) als in
 * de API-routes: beide hebben Web Crypto.
 */

export const COOKIE_NAME = 'im_auth';

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`ironman-tracker:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Alleen terugsturen naar een pagina van de tracker zelf, nooit naar een andere site. */
export function safeNext(from: string | null | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return '/';
  return from;
}
