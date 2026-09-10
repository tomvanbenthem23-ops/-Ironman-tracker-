# Ironman 70.3 Valencia Tracker

Trainingstracker voor Tom & Quirijn richting de halve Ironman van Valencia,
**zondag 18 april 2027**, doel **sub-5 uur**.

Dit is het casco: het template is uitgekleed, de database, de API en het
inlogscherm staan klaar. **De app zelf wordt gebouwd op basis van
[`IRONMAN_PROMPT.md`](./IRONMAN_PROMPT.md)** — die build-spec is de bron van
waarheid voor gedrag, formules, teksten en design.

## Stack

Basis: [`vercel/nextjs-postgres-nextauth-tailwindcss-template`](https://github.com/vercel/nextjs-postgres-nextauth-tailwindcss-template).

| Onderdeel | Keuze |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind + shadcn/ui (`components/ui`) |
| Database | Neon Postgres via Drizzle (`lib/db.ts`) |
| Auth | Eén gedeeld wachtwoord (`IM_PASSWORD`), cookie-gate in `middleware.ts` |
| Drag & drop | `@dnd-kit/*` |
| Grafieken | `recharts` |

De GitHub-OAuth-login van het template is eruit; twee mensen met één wachtwoord
is genoeg (sectie 2 van de prompt).

## Routes

| Route | Doet |
|---|---|
| `GET /api/migrate` | Maakt de tabellen aan. Eenmalig na de eerste deploy, idempotent. |
| `GET /api/state` | Hele state in de vorm van sectie 5 van de prompt. |
| `POST /api/state` | `{workout}` · `{deleteWorkout}` · `{weekly}` · `{garmin}` · `{import}` |
| `POST /api/login` | Zet het cookie. `DELETE` logt uit. |

De `{import}`-variant slikt een export uit de oude losse HTML-versie
(`ironman-data-YYYY-MM-DD.json`) en merget die per record.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # vul POSTGRES_URL en IM_PASSWORD in
npm run dev
```

Zonder `IM_PASSWORD` staat het inlogscherm uit — handig lokaal, nooit doen in
productie.

## Deployen

Zie [`DEPLOY.md`](./DEPLOY.md).
