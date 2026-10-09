# Ironman 70.3 Valencia Tracker

Trainingstracker voor Tom & Quirijn richting de halve Ironman van Valencia,
**zondag 18 april 2027**, doel **sub-5 uur**.

Agenda met voorschriften en weekadvies, een dashboard met eindtijdvoorspelling,
en een Garmin-koppeling via intervals.icu. **[`IRONMAN_PROMPT.md`](./IRONMAN_PROMPT.md)**
is de build-spec en de bron van waarheid voor gedrag, formules, teksten en design.

## Stack

Basis: [`vercel/nextjs-postgres-nextauth-tailwindcss-template`](https://github.com/vercel/nextjs-postgres-nextauth-tailwindcss-template).

| Onderdeel | Keuze |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind, eigen `im-`-tokens (`tailwind.config.ts`) |
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
| `POST /api/state` | `{workout}` · `{deleteWorkout}` · `{weekly}` · `{garmin}` · `{settings}` · `{weekFlag}` |
| `POST /api/sync` | Garmin-data ophalen via intervals.icu (activiteiten met intervallen, VO2max, rusthartslag, gewicht, hartslagzones). Ook dagelijks via Vercel Cron. |
| `POST /api/login` | Zet het cookie. `DELETE` logt uit. |

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # vul POSTGRES_URL en IM_PASSWORD in
npm run dev
```

Zonder `IM_PASSWORD` staat het inlogscherm uit — handig lokaal, nooit doen in
productie.

## Deployen

De app draait op **https://ironman-tracker-khaki.vercel.app**. Zie [`DEPLOY.md`](./DEPLOY.md)
voor de opzet.
