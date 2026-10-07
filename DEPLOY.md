# Deploy

**Staat live.** Dit bestand beschrijft hoe het draait en wat er nog te doen is.

## Wat er staat

| | |
|---|---|
| Repo | `github.com/tomvanbenthem23-ops/-Ironman-tracker-` (branch `main`) |
| Vercel-project | `ironman-tracker`, team Goonsquad (Hobby) |
| URL | **https://ironman-tracker-khaki.vercel.app** |
| Database | Neon Postgres, `eu-central-1` (Frankfurt), alleen Production |
| Functions | Frankfurt (`fra1`), via `preferredRegion` in de API-routes |
| Auth | Gedeeld wachtwoord in de env var `IM_PASSWORD` |

Elke push naar `main` deployt automatisch.

De regio staat bewust in de code (`export const preferredRegion = 'fra1'` boven
in elke route) en niet in de projectinstellingen: het dashboard weigerde die
instelling op te slaan, en zo staat hij in versiebeheer.

## Gedaan

- [x] Repo gepusht en geïmporteerd in Vercel
- [x] Neon gekoppeld, `POSTGRES_URL` wordt automatisch geïnjecteerd
- [x] `IM_PASSWORD` gezet (Production + Preview)
- [x] `GET /api/migrate` gedraaid — tabellen `workouts`, `weekly`, `garmin` staan klaar
- [x] Gecontroleerd: `/` stuurt door naar `/login`, `/api/*` geeft 401 zonder cookie,
      `/api/state` geeft een lege state terug

## Garmin koppelen (via intervals.icu)

Garmin geeft particulieren geen API; intervals.icu is officieel aan Garmin
Connect gekoppeld en heeft wel een API. Per persoon, eenmalig:

1. Account maken op intervals.icu en onder **Settings → Garmin** Garmin
   Connect koppelen. Zet daar ook het vinkje voor VO2max (en wellness:
   rusthartslag, gewicht) aan. Koppel Garmin **rechtstreeks**, niet via Strava:
   Strava-activiteiten geeft intervals.icu niet door via de API.
2. **Settings → Developer Settings → API key** aanmaken.
3. In Vercel → Settings → Environment Variables: `ICU_TOM_API_KEY` (en voor
   Quirijn later `ICU_QUIRIJN_API_KEY`). Daarnaast één keer `CRON_SECRET`
   (willekeurige lange string) voor de dagelijkse sync om 05:00 UTC.
4. Redeploy. De app haalt dan bij openen (en via 🔄 Garmin) alles op vanaf
   1 september en koppelt het aan wat er gepland of al ingevuld was.

Na elke deploy die het schema uitbreidt: eenmalig `/api/migrate` openen.

## Kosten

Vercel Hobby is gratis voor persoonlijk, niet-commercieel gebruik. Het gratis
Neon-plan is ruim voldoende: het gaat om een paar duizend rijen tot april 2027.
