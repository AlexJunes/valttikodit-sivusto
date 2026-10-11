# Arkkitehtuuri

Selitysdokumentti. Ajantasaiset tekniset faktat (sivut, CMS-kentät, taulut, riippuvuudet, sitemap) ovat automaattisesti generoidussa `TILA.md`:ssä. Tietokanta: `tietokanta.md`. Tietoturva: `tietoturva.md`. Agentit: `agentit.md`. Alkuperäinen käsikirja on arkistoitu (`alkuperainen-luovutuskasikirja.md`, vanhentunut).

## Ekosysteemi

- **GitHub** (`AlexJunes/valttikodit-sivusto`, haara `main`) → GitHub Pages → www.valttikodit.fi. Push mainiin julkaisee.
- **Supabase** (projekti `xbeonksexpjvekqjxoph`): PostgreSQL, Auth + TOTP-MFA, Storage (bucket `images`).
- **Web3Forms**: sähköposti-ilmoitus jokaisesta liidistä (`https://api.web3forms.com/submit`).
- Supabase SDK ladataan CDN:stä (`@supabase/supabase-js@2`) jokaisella sivulla, jolla sitä tarvitaan.

## Reititys (`404.html`) – ÄLÄ MUUTA

GitHub Pages ei tue rewrite-sääntöjä. `/kohteet/<slug>` ei vastaa tiedostoa, joten Pages palauttaa `404.html`, joka ohjaa osoitteeseen `/kohde.html?kohde=<slug>&rewrite=true`. `main.js` korvaa osoitepalkin puhtaaksi URL:ksi (`history.replaceState`). Muut tuntemattomat polut ohjataan etusivulle `/?404=true`.

**SEO-huomio:** `/kohteet/<slug>` palauttaa HTTP-tilan **404** (GitHub Pages palauttaa `404.html`), joten hakukone ei indeksoi sitä. Sitemap ja canonical käyttävät siksi osoitteita `https://www.valttikodit.fi/kohde.html?kohde=<slug>` (HTTP 200). Pysyvä korjaus olisi staattiset sivut jokaiselle kohteelle (ei vielä tehty).

## CMS (`data-cms`)

Elementti `data-cms="Avain"` täytetään taulun `pages` JSONB-sisällöstä (rivi `slug` = sivun tunnus). Tyypit: teksti, `<img>` (src), taustakuva (inline style), lista (`data-list`). `main.js` näyttää ensin `sessionStorage`-välimuistin (`cms_<slug>`), hakee sitten tuoreen sisällön Supabasesta ja päivittää DOMin. Oletussisältö on HTML:ssä, joten sivu toimii ilman tietokantaa.

## Kohteet

Taulu `projects`. Julkaistut (`published = true`) näkyvät julkisesti. Tilat: `MARKETING`, `AVAILABLE`, `CONSTRUCTION` (näyttää valmiusasteen palkkina, `details['Valmiusaste (%)']`), `RESERVED` ja `SOLD` (varausnappi poistetaan, SOLD siirtyy "Myydyt kohteet" -lohkoon). Kohdesivu: kuvakaruselli + lightbox, Google Maps iframe (`details['Google Maps Embed']`), materiaalipaketti/PDF, SEO-schema (`SingleFamilyResidence`) generoidaan dynaamisesti.

## Referenssit

Taulu `reference_cases` (ks. `tietokanta.md`). **Lista:** `referenssit.html` (ensimmäinen referenssi isona nostona, loput ruudukkona; skaalautuu 1..N referenssiin). **Yksittäinen sivu:** `referenssi.html?r=<slug>`, jonka kaikki sivut renderöi `assets/js/references.js` samasta pohjasta (hero, tunnusluvut, tarina, lainaus, galleria, ratkaisut, yhteinen prosessiosio, sijainti, tiedot, muut referenssit, yhteydenottolomake). Tyhjät osiot jätetään pois. Meta-tagit, canonical ja JSON-LD luodaan JavaScriptillä (kuten kohdesivulla). **Ylläpito:** `admin/references.html` (lista, järjestys, julkaisu) ja `admin/edit-reference.html` (lomake, kuvien lataus), logiikka `assets/js/admin-references.js`. **Sitemap:** lisää uusi referenssi käsin muodossa `https://www.valttikodit.fi/referenssi.html?r=<slug>` (puhdasta osoitetta ei ole).

## Lomakkeet ja liidit

`yhteys.html`, kohteen varaus- ja materiaalilomake sekä uutiskirje: tallennus Supabaseen (`leads`, tila `UUSI`/`KÄSITELTY`) **ja** Web3Forms-sähköposti. Supabase-kirjoitus odotetaan ennen ohjausta kiitossivulle; sähköposti lähetetään taustalla.

## Evästeet ja analytiikka

Oma toteutus ilman kolmannen osapuolen seurantaa. Suostumus: `localStorage` `valttikodit_cookie_consent`. Sallittaessa analytiikka luodaan `sessionStorage` `v_session`; `page_views` tallentaa polun, laitetyypin ja viittaajan. Jos analytiikka kielletty, `session_id` jää tyhjäksi. Admin-näkymä: `admin/analytics.html` + `analytics-dashboard.js` (Chart.js).

## Admin

Kaikki tietokannasta tuleva teksti pitää escapeta ennen `innerHTML`-käyttöä (`esc()` `admin.js`:ssä ja `analytics-dashboard.js`:ssä): lomakkeiden "sanitointi" tapahtuu vain selaimessa, ja julkinen avain mahdollistaa suoran tietokantakirjoituksen.

`admin/login.html` → salasana + TOTP (rekisteröinti QR-koodilla ensimmäisellä kerralla). Jokainen admin-sivu tarkistaa `aal2`-tason `admin.js`:ssä (selainpuolen suojaus; varsinainen suoja on RLS, ks. `tietoturva.md`). `update_nav.js` (Node) synkronoi admin-navigaation kaikkiin admin-sivuihin.

## Tiedostot

Ks. hakemistorakenne repon juuresta. Vanhat: `app/`, `utils/` (Next.js-kokeilu, ei käytössä), `kohde_test.html` (testitiedosto).

## SEO

Kaikilla julkisilla sivuilla on meta description, canonical (www) ja OG-tagit. Kohdesivun meta-tagit, canonical ja schema (`SingleFamilyResidence`, mukana `offers` hinta ja saatavuus) luodaan JavaScriptillä `main.js`:ssä. Sivukohtainen tila: `TILA.md`.

`index.html` sisältää `RealEstateAgent`-schema. `robots.txt` estää `/admin/` ja `/kiitos.html`. **Päivitä `sitemap.xml` käsin** kun sivuja lisätään tai kohteita julkaistaan/poistetaan (kohteet muodossa `kohde.html?kohde=<slug>`). Kuukausittainen SEO-agentti huomauttaa eroista.

## Myy tonttisi (myy-tonttisi.html)

Tonttien hankintasivu (aiemmin "Ostamme tontteja", `ostamme-tontteja.html`, joka on nyt vain ohjaussivu uuteen osoitteeseen). Rakenne: ilmakuvahero (`.hero-myy` + `assets/img/myy-tonttisi/`), tunnusluvut, kaksi tapaa myydä (suora kauppa / yhteistyö), mitä etsimme, edut, prosessi, referenssiohjaus, UKK ja tonttilomake (Web3Forms, lähde "Myy tonttisi -sivu"; lisäkentät `data-extra-label` liitetään liidin viestiin). Tekstit ovat ylläpidosta muokattavia (`data-cms`, sivu `myy-tonttisi`, oletukset `defaultSchemas` admin.js:ssä).

## Yhteinen sivurunko ja ulkoasu

Kaikilla sivuilla on sama rytmi: **kuvahero** (`.hero` etusivulla, `.ref-hero` referenssi- ja tonttisivulla; korkeus `clamp(480px, 70vh, 780px)`, h1 enintään 3.75rem) tai **perussivun otsikkoalue** `.page-intro` (pikkuotsikko `.eyebrow`, h1 enintään 3rem, ingressi; vasen tasaus). Lukusivut (Tarinamme, Tietosuoja) käyttävät leveyttä `.container--narrow` (800 px). Osiot käyttävät luokkia `.section`, `.section--white`, `.section--alt` (5rem / mobiilissa 3.5rem); `.py-16` on samat arvot. Uusi sivu: kopioi `.page-intro`-rakenne esim. `kohteet.html`:sta. Huom. `yhteys.html`:ssa ylläpidon "Kuvaus"-kentän arvo voi olla kuva-URL (renderoidaan kuvaksi), joten otsikko ja kuvaus pysyvät vasemmassa sarakkeessa.
