# Deployen naar Vercel

Eenmalig ~10 minuten. Alles wat een login nodig heeft staat hieronder als
"jij doet dit".

## 1. Repo op GitHub

De repo staat lokaal in `OneDrive/Claude/ironman-app` met een eerste commit.
Maak op github.com een **lege** repo `Ironman-tracker` aan (geen README, geen
.gitignore) onder je eigen account, en push:

```bash
git remote add origin https://github.com/<jouw-account>/Ironman-tracker.git
git branch -M main
git push -u origin main
```

## 2. Project importeren in Vercel

1. vercel.com → **Add New… → Project**
2. Kies de repo `Ironman-tracker`. Framework wordt automatisch herkend als
   Next.js — niets aanpassen.
3. **Nog niet deployen.** Eerst de database en de env vars (stap 3 en 4).
   Deploy je toch al, dan faalt hooguit de eerste build; opnieuw deployen na
   stap 4 lost het op.

## 3. Database koppelen (Neon)

1. In het project → **Storage → Create Database → Neon (Postgres)**, gratis plan.
2. Koppel hem aan dit project, environment **Production + Preview + Development**.
3. Vercel zet `POSTGRES_URL` (en een handvol varianten) automatisch als env var.
   Zelf niets invullen.

## 4. Env vars

Project → **Settings → Environment Variables**:

| Naam | Waarde |
|---|---|
| `IM_PASSWORD` | het gedeelde wachtwoord dat jij en Quirijn gebruiken |

`POSTGRES_URL` komt uit stap 3. Meer is er niet nodig — de GitHub-OAuth-variabelen
uit het originele template zijn niet in gebruik.

## 5. Deployen en tabellen aanmaken

1. **Deploy**.
2. Open eenmalig `https://<jouw-app>.vercel.app/api/migrate`. Je moet eerst
   inloggen met `IM_PASSWORD`. Antwoord `{"ok":true,...}` = tabellen staan klaar.
3. Check `https://<jouw-app>.vercel.app/api/state` — die hoort een lege state
   terug te geven.

## 6. Oude data importeren

De oude tracker (`ironman-tracker.html`) heeft een **⬇️ export**-knop. Draai die
één keer op elke laptop waar data op staat, en POST elk bestand naar `/api/state`:

```bash
curl -X POST https://<jouw-app>.vercel.app/api/state \
  -H "Content-Type: application/json" \
  -H "Cookie: im_auth=<jouw IM_PASSWORD>" \
  -d "{\"import\": $(cat ironman-data-2027-01-15.json) }"
```

Of, zodra de app gebouwd is, via de importknop in de UI. Importeren merget per
record: bestaande trainingen met hetzelfde id worden overschreven, de rest blijft
staan. Je kunt dus veilig eerst Toms bestand en daarna dat van Quirijn inlezen.

## Kosten

Vercel Hobby is gratis voor persoonlijk, niet-commercieel gebruik. Neon's gratis
plan is ruim voldoende: het gaat om een paar duizend rijen tot april 2027.

## Daarna

De app zelf bouwen op basis van `IRONMAN_PROMPT.md`. Elke push naar `main`
deployt automatisch; pull requests krijgen een preview-URL.
