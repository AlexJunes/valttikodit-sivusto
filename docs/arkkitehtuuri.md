# Arkkitehtuuri

Lähde: alkuperäinen luovutuskäsikirja (`alkuperainen-luovutuskasikirja.md`), tarkistettu koodia vasten 10.10.2026.

## Ekosysteemi

- **GitHub** (`AlexJunes/valttikodit-sivusto`, haara `main`) → GitHub Pages → www.valttikodit.fi. Push mainiin julkaisee.
- **Supabase** (projekti `xbeonksexpjvekqjxoph`): PostgreSQL, Auth + TOTP-MFA, Storage (bucket `images`).
- **Web3Forms**: sähköposti-ilmoitus jokaisesta liidistä (`https://api.web3forms.com/submit`).
- Supabase SDK ladataan CDN:stä (`@supabase/supabase-js@2`) jokaisella sivulla, jolla sitä tarvitaan.

## Reititys (`404.html`) – ÄLÄ MUUTA

GitHub Pages ei tue rewrite-sääntöjä. `/kohteet/<slug>` ei vastaa tiedostoa, joten Pages palauttaa `404.html`, joka ohjaa osoitteeseen `/kohde.html?kohde=<slug>&rewrite=true`. `main.js` korvaa osoitepalkin puhtaaksi URL:ksi (`history.replaceState`). Muut tuntemattomat polut ohjataan etusivulle `/?404=true`.

## CMS (`data-cms`)

Elementti `data-cms="Avain"` täytetään taulun `pages` JSONB-sisällöstä (rivi `slug` = sivun tunnus). Tyypit: teksti, `<img>` (src), taustakuva (inline style), lista (`data-list`). `main.js` näyttää ensin `sessionStorage`-välimuistin (`cms_<slug>`), hakee sitten tuoreen sisällön Supabasesta ja päivittää DOMin. Oletussisältö on HTML:ssä, joten sivu toimii ilman tietokantaa.

## Kohteet

Taulu `projects`. Julkaistut (`published = true`) näkyvät julkisesti. Tilat: `MARKETING`, `AVAILABLE`, `CONSTRUCTION` (näyttää valmiusasteen palkkina, `details['Valmiusaste (%)']`), `RESERVED` ja `SOLD` (varausnappi poistetaan, SOLD siirtyy "Myydyt kohteet" -lohkoon). Kohdesivu: kuvakaruselli + lightbox, Google Maps iframe (`details['Google Maps Embed']`), materiaalipaketti/PDF, SEO-schema (`SingleFamilyResidence`) generoidaan dynaamisesti.

## Lomakkeet ja liidit

`yhteys.html`, kohteen varaus- ja materiaalilomake sekä uutiskirje: tallennus Supabaseen (`leads`, tila `UUSI`/`KÄSITELTY`) **ja** Web3Forms-sähköposti. Supabase-kirjoitus odotetaan ennen ohjausta kiitossivulle; sähköposti lähetetään taustalla.

## Evästeet ja analytiikka

Oma toteutus ilman kolmannen osapuolen seurantaa. Suostumus: `localStorage` `valttikodit_cookie_consent`. Sallittaessa analytiikka luodaan `sessionStorage` `v_session`; `page_views` tallentaa polun, laitetyypin ja viittaajan. Jos analytiikka kielletty, `session_id` jää tyhjäksi. Admin-näkymä: `admin/analytics.html` + `analytics-dashboard.js` (Chart.js).

## Admin

`admin/login.html` → salasana + TOTP (rekisteröinti QR-koodilla ensimmäisellä kerralla). Jokainen admin-sivu tarkistaa `aal2`-tason `admin.js`:ssä (selainpuolen suojaus; varsinainen suoja on RLS, ks. `tietoturva.md`). `update_nav.js` (Node) synkronoi admin-navigaation kaikkiin admin-sivuihin.

## Tiedostot

Ks. hakemistorakenne repon juuresta. Vanhat: `app/`, `utils/` (Next.js-kokeilu, ei käytössä), `kohde_test.html` (testitiedosto).

## SEO

`index.html` sisältää `RealEstateAgent`-schema, kohdesivut generoivat omansa. `robots.txt` estää `/admin/` ja `/kiitos.html`. Päivitä `sitemap.xml` kun sivuja lisätään tai kohteita julkaistaan/poistetaan.
