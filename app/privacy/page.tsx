import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '../ui/site-footer';

export const metadata: Metadata = {
  title: 'Privacyverklaring',
  description:
    'Welke gegevens de trainingstracker van Tom en Quirijn opslaat, waar ze staan, hoe lang, welke rechten je hebt en hoe je die uitoefent.'
};

const UPDATED = '9 oktober 2026';

/**
 * Privacyverklaring. Beschrijft alleen wat de code echt doet: zie lib/db.ts
 * (tabellen), lib/store.tsx (browseropslag), lib/auth.ts (cookie) en
 * app/api/sync (intervals.icu). Bij wijzigingen daar: deze pagina bijwerken.
 */
export default function PrivacyPage() {
  return (
    <>
      <header className="bg-im-navy px-6 py-4 text-white">
        <Link
          href="/"
          className="inline-block rounded-im-ctl text-[1.35rem] font-bold tracking-[.5px] hover:opacity-90"
        >
          🏊🚴🏃 IRONMAN 70.3 VALENCIA
          <small className="mt-0.5 block text-[.8rem] font-normal text-im-navy-soft">
            Zondag 18 april 2027 · doel: onder de 5 uur
          </small>
        </Link>
      </header>

      <main className="px-6 py-8">
        <article className="mx-auto max-w-[68ch] rounded-im-card bg-white p-6 text-[.95rem] leading-relaxed shadow-im-card sm:p-8 [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-[1.1rem] [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          <h1 className="text-[1.5rem] font-bold">Privacyverklaring</h1>
          <p className="text-[.85rem] text-im-muted">
            Laatst bijgewerkt: {UPDATED}
          </p>

          <h2>Wie we zijn</h2>
          <p>
            Deze trainingstracker is een privé-app van Tom van Benthem en
            Quirijn, die samen trainen voor de Ironman 70.3 Valencia op 18 april
            2027. De app staat achter een gedeeld wachtwoord en heeft geen
            andere gebruikers. Tom beheert de app en is het aanspreekpunt voor
            alles in deze verklaring.
          </p>

          <h2>Welke gegevens we opslaan</h2>
          <ul>
            <li>
              <b>Trainingen</b>, per persoon: datum, soort training, of hij
              gedaan is, tijd, afstand, gemiddelde en maximale hartslag,
              hoogtemeters, vermogen, hoe zwaar het voelde (RPE), de opbouw in
              blokken met tempo en hartslag per herhaling, wind, en of je binnen
              fietste.
            </li>
            <li>
              <b>Gezondheids- en fitheidswaarden</b>: VO2max, rusthartslag en
              gewicht per week, en je instellingen voor maximale hartslag, zone
              2, omslagpunt en FTP.
            </li>
            <li>
              <b>Drie weektellers</b> die je zelf bijhoudt, waaronder
              rekmomenten en één over je privéleven.
            </li>
            <li>
              <b>Rustweken</b> die je zelf omzet, voor jullie allebei.
            </li>
          </ul>
          <p>
            Deze gegevens vul je zelf in, of ze komen uit je Garmin via{' '}
            <b>intervals.icu</b>: daar koppel je zelf je Garmin-account, en de
            tracker haalt met jouw API-sleutel je activiteiten, intervallen,
            tempoverloop, hartslag, wellnesswaarden en hartslagzones op. Die
            sleutel staat als geheime instelling bij de hosting, niet in de
            database en niet in je browser.
          </p>
          <p>
            Een deel hiervan zijn gezondheidsgegevens, en de derde weekteller
            gaat over je privéleven. Ze worden alleen gebruikt voor jullie eigen
            training en zijn alleen zichtbaar voor wie het wachtwoord heeft.
          </p>

          <h2>Waarvoor, en op welke grond</h2>
          <p>
            Alleen om jullie training te plannen en te volgen: voorschriften,
            weekadvies, het oordeel na afloop en de voorspelde eindtijd. Niets
            wordt verkocht, gedeeld voor reclame of gebruikt voor iets anders.
          </p>
          <p>
            Omdat dit een app is voor twee vrienden die samen trainen, valt het
            gebruik in principe onder de uitzondering voor puur persoonlijk
            gebruik van de AVG (artikel 2 lid 2 onder c). Voor zover de AVG wel
            van toepassing is, is de grondslag jullie eigen{' '}
            <b>uitdrukkelijke toestemming</b> (artikel 6 lid 1 onder a en
            artikel 9 lid 2 onder a): je vult de gegevens zelf in of koppelt
            zelf je Garmin. Die toestemming kun je altijd intrekken.
          </p>

          <h2>Cookies en opslag in je browser</h2>
          <p>
            De tracker gebruikt geen analyse-, reclame- of trackingcookies en
            laadt geen scripts van derden. Daarom is er geen cookiemelding. Wel
            nodig voor de werking:
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[.85rem]">
              <thead>
                <tr className="border-b border-im-line text-im-muted">
                  <th className="py-1.5 pr-3 font-semibold">Naam</th>
                  <th className="py-1.5 pr-3 font-semibold">Soort</th>
                  <th className="py-1.5 pr-3 font-semibold">Waarvoor</th>
                  <th className="py-1.5 font-semibold">Hoe lang</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top [&_tr]:border-b [&_tr]:border-im-hairline">
                <tr>
                  <td>
                    <code>im_auth</code>
                  </td>
                  <td>cookie, noodzakelijk</td>
                  <td>
                    onthoudt dat je ingelogd bent; bevat een afgeleide sleutel,
                    niet het wachtwoord
                  </td>
                  <td>180 dagen</td>
                </tr>
                <tr>
                  <td>
                    <code>im_person</code>
                  </td>
                  <td>browseropslag, functioneel</td>
                  <td>onthoudt of je de tracker van Tom of Quirijn bekeek</td>
                  <td>tot je je browsergegevens wist</td>
                </tr>
                <tr>
                  <td>
                    <code>im_pending_v1</code>
                  </td>
                  <td>browseropslag, functioneel</td>
                  <td>
                    wijzigingen die nog niet verstuurd konden worden
                    (bijvoorbeeld zonder internet)
                  </td>
                  <td>tot ze verstuurd zijn</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>Waar de gegevens staan</h2>
          <ul>
            <li>
              <b>Vercel</b> (hosting en de serverfuncties, die in Frankfurt
              draaien). Vercel houdt korte technische logbestanden bij van
              verzoeken, met onder meer je IP-adres.
            </li>
            <li>
              <b>Neon</b> (de database, in Frankfurt).
            </li>
            <li>
              <b>intervals.icu</b>: alleen als je je Garmin koppelt. Daar staan
              je Garmin-gegevens volgens de voorwaarden van intervals.icu; de
              tracker leest ze alleen.
            </li>
          </ul>
          <p>
            Vercel en Neon zijn Amerikaanse bedrijven. De gegevens staan in de
            EU, maar het bedrijf erachter kan er vanuit de VS bij. Beide leggen
            de doorgifte vast met de standaardcontractbepalingen van de Europese
            Commissie en/of het EU-VS Data Privacy Framework.
          </p>

          <h2>Hoe lang</h2>
          <p>
            Trainingen, waarden en tellers blijven bewaard zolang de tracker in
            gebruik is. Verwijder je een training, dan is die direct weg; de
            database bevat daarnaast één reservekopie van de trainingen van vóór
            een schemawijziging in oktober 2026. Wil je dat al je gegevens
            worden verwijderd, vraag het Tom: dan gebeurt dat, inclusief de
            reservekopie.
          </p>

          <h2>Je rechten</h2>
          <p>Je hebt het recht om:</p>
          <ul>
            <li>
              je gegevens in te zien en een kopie te krijgen in een gangbaar
              formaat (dataportabiliteit);
            </li>
            <li>
              onjuiste gegevens te laten verbeteren (de meeste kun je zelf
              aanpassen in de tracker);
            </li>
            <li>
              je gegevens te laten verwijderen, of het gebruik ervan te laten
              beperken;
            </li>
            <li>bezwaar te maken tegen het gebruik;</li>
            <li>
              je toestemming in te trekken, bijvoorbeeld door je Garmin los te
              koppelen in intervals.icu;
            </li>
            <li>
              een klacht in te dienen bij de Autoriteit Persoonsgegevens (
              <a
                href="https://autoriteitpersoonsgegevens.nl"
                className="underline underline-offset-2"
                rel="noopener"
                target="_blank"
              >
                autoriteitpersoonsgegevens.nl
              </a>
              ).
            </li>
          </ul>
          <p>Voor al deze verzoeken neem je contact op met Tom.</p>

          <h2>Beveiliging</h2>
          <ul>
            <li>Alle verbindingen lopen via HTTPS.</li>
            <li>
              De tracker en de database zijn alleen bereikbaar met het gedeelde
              wachtwoord; het inlogcookie is alleen voor de server leesbaar en
              bevat het wachtwoord niet.
            </li>
            <li>
              API-sleutels staan als geheime instellingen bij de hosting en
              komen nooit in de browser.
            </li>
            <li>
              De dagelijkse automatische synchronisatie gebruikt een eigen
              geheime sleutel.
            </li>
          </ul>

          <h2>AI</h2>
          <p>
            In de tracker zit geen AI. Het weekadvies, de voorschriften en de
            eindtijdvoorspelling zijn vaste rekenregels die je in de code kunt
            nalezen; er worden geen gegevens naar een AI-dienst gestuurd. De
            code zelf is geschreven met hulp van een AI-programmeerassistent.
            Als de tracker ooit wel een AI-systeem gaat gebruiken, staat dat
            hier en in de app zelf, in lijn met de transparantieregels van de
            Europese AI-verordening.
          </p>

          <h2>AVG</h2>
          <p>
            We gaan met deze gegevens om volgens de Algemene verordening
            gegevensbescherming (AVG). Verandert er iets aan wat de tracker
            opslaat of waar, dan passen we deze verklaring aan en zetten we de
            datum hierboven bij.
          </p>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
