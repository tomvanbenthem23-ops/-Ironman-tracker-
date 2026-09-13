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

## Nog te doen

Niets. De agenda en het dashboard staan er; oude data wordt met de hand
ingevoerd, dus er is geen migratie meer nodig.

## Kosten

Vercel Hobby is gratis voor persoonlijk, niet-commercieel gebruik. Het gratis
Neon-plan is ruim voldoende: het gaat om een paar duizend rijen tot april 2027.
