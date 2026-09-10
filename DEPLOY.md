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

**1. Oude data importeren.** De losse HTML-tracker (`OneDrive/IRONMAN/ironman-tracker.html`)
heeft een ⬇️ export-knop. Draai die één keer op elke laptop waar data op staat en
POST elk bestand:

```bash
curl -X POST https://ironman-tracker-khaki.vercel.app/api/state \
  -H "Content-Type: application/json" \
  -H "Cookie: im_auth=<IM_PASSWORD>" \
  -d "{\"import\": $(cat ironman-data-2027-01-15.json) }"
```

Importeren merget per record: een training met hetzelfde id wordt overschreven,
de rest blijft staan. Je kunt dus veilig eerst Toms bestand en daarna dat van
Quirijn inlezen.

**2. De app bouwen** op basis van [`IRONMAN_PROMPT.md`](./IRONMAN_PROMPT.md).
Op `/` staat nu alleen een casco-pagina.

## Kosten

Vercel Hobby is gratis voor persoonlijk, niet-commercieel gebruik. Het gratis
Neon-plan is ruim voldoende: het gaat om een paar duizend rijen tot april 2027.
