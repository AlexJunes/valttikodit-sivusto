# Valttikodit.fi – ohjeet Claudelle

Valttikodit Oy:n verkkosivusto. Staattinen HTML/CSS/Vanilla JS (ei build-vaihetta), Supabase backendina, GitHub Pages hostina. Domain: www.valttikodit.fi (`CNAME`).

Tarkempi dokumentaatio: `docs/` (lue vain tarvittaessa). Tietokanta: `supabase/`.

## Ehdottomat säännöt

1. **Älä pushaa suoraan `main`-haaraan.** `main` julkaistaan tuotantoon heti. Työskentele haarassa (`feat/…`, `fix/…`) ja avaa pull request. Merge tekee käyttäjä.
2. **Älä koskaan kirjoita tuotantotietokantaan** (INSERT/UPDATE/DELETE/DDL) ilman käyttäjän erillistä hyväksyntää. Skeemamuutokset kirjoitetaan tiedostoksi `supabase/migrations/PVM_nimi.sql`, ja käyttäjä ajaa ne itse Supabasen SQL Editorissa.
3. **Älä muuta `404.html`:n reititysloogikkaa.** Se mahdollistaa osoitteet `/kohteet/<slug>` (ks. `docs/arkkitehtuuri.md`).
4. **Ei build-työkaluja.** Älä lisää Node/npm/bundleria tuotantosivustoon. `app/` ja `utils/` ovat vanhoja Next.js-jäänteitä: älä käytä, älä aja `next build`.
5. **Salaisuudet:** `service_role`-avainta, tietokannan salasanaa tai tokeneita ei koskaan kirjoiteta tiedostoihin tai chattiin. Selaimessa olevat Supabase anon/publishable-avain ja Web3Forms-avain ovat julkisia, ja se on tarkoituksellista.
6. **Henkilötiedot:** liidit (`leads`) sisältävät asiakkaiden nimiä, sähköposteja ja puhelinnumeroita. Raporteissa ja logeissa vain lukumääriä, ei yksittäisiä asiakastietoja.
7. Kysy ennen kaikkea peruuttamatonta tai ulospäin näkyvää (julkaisu, viestin lähetys, poisto).

## Arkkitehtuuri lyhyesti

- Julkiset sivut: `index.html`, `kohteet.html`, `kohde.html` (dynaaminen, `?kohde=slug`), `tarinamme.html`, `yhteys.html`, `kiitos.html`, `tietosuojaseloste.html`.
- Admin (`admin/`): Supabase Auth + TOTP-MFA (`aal2`-tarkistus `assets/js/admin.js`:ssä).
- JS: `assets/js/main.js` (julkinen: CMS, kohteet, lomakkeet, evästeet, analytiikka), `admin.js`, `analytics-dashboard.js`, `config.js` (Supabase-asetukset).
- CMS: elementit joilla `data-cms="Nimi"` täytetään taulusta `pages` (JSONB), välimuisti `sessionStorage` (`cms_<slug>`).
- Tietokanta: `projects`, `pages`, `leads`, `page_views`, `admin_users`. Skeema: `supabase/schema.sql`.
- Lomakkeet kirjoittavat sekä Supabaseen (`leads`) että Web3Forms-sähköpostiin.
- Kohteen tilat: `MARKETING`, `AVAILABLE`, `CONSTRUCTION`, `RESERVED`, `SOLD`. RESERVED/SOLD piilottavat varausnapin.

## Kehitys ja testaus

```bash
python3 -m http.server 8080   # avaa http://localhost:8080
```

- Testaa muutos selaimessa ennen PR:ää (desktop + mobiili). Tarkista konsolista virheet.
- Testaa `/kohteet/<slug>` -reititys paikallisesti kohdesivun kautta: `kohde.html?kohde=<slug>`. Puhdas URL toimii vain GitHub Pagesissa.
- Uusi sivu: kopioi rakenne `tarinamme.html`:stä, lisää `data-cms`-attribuutit, lisää `sitemap.xml`:ään ja admin-listaan, aja `node update_nav.js` jos admin-navigaatio muuttuu.
- Kirjoita commit-viestit muotoon `feat:`, `fix:`, `perf:`, `docs:` (kuten historiassa). Sivuston sisältö ja käyttäjille näkyvät tekstit ovat suomeksi.

## Tunnetut huomiot (tarkistettava)

- `.env.local` on versionhallinnassa (sisältää vain julkiset avaimet; ei käytössä staattisella sivustolla). Harkitse poistoa.
- README.md on vanhentunut (mainitsee mm. `kohdesivut/`, `valtti-tapa.html`).
- RLS-säännöt: `docs/tietoturva.md` listaa tarkastettavat kohdat. Selvitä todellinen tila Supabasesta ennen muutoksia.
