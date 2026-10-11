# Valttikodit.fi – ohjeet Claudelle

Valttikodit Oy:n verkkosivusto. Staattinen HTML/CSS/Vanilla JS (ei build-vaihetta), Supabase backendina, GitHub Pages hostina. Domain: www.valttikodit.fi (`CNAME`).

Dokumentaatio (lue tarvittaessa): `docs/TILA.md` (GENEROITU tuotantotila), `docs/arkkitehtuuri.md`, `docs/tietokanta.md`, `docs/tietoturva.md`, `docs/agentit.md`, `docs/ymparistot.md`. Tietokantamigraatiot: `supabase/migrations/`.

## Ehdottomat säännöt

1. **Älä pushaa suoraan `main`-haaraan.** `main` julkaistaan tuotantoon heti. Työskentele haarassa (`feat/…`, `fix/…`) ja avaa pull request. Merge tekee käyttäjä.
2. **Älä koskaan kirjoita tuotantotietokantaan** (INSERT/UPDATE/DELETE/DDL) ilman käyttäjän erillistä hyväksyntää. Skeemamuutokset kirjoitetaan tiedostoksi `supabase/migrations/PVM_nimi.sql`, ja käyttäjä ajaa ne itse Supabasen SQL Editorissa.
3. **Älä muuta `404.html`:n reititysloogikkaa.** Se mahdollistaa osoitteet `/kohteet/<slug>` (ks. `docs/arkkitehtuuri.md`).
4. **Ei build-työkaluja.** Älä lisää Node/npm/bundleria tuotantosivustoon. `app/` ja `utils/` ovat vanhoja Next.js-jäänteitä: älä käytä, älä aja `next build`.
5. **Salaisuudet:** `service_role`-avainta, tietokannan salasanaa tai tokeneita ei koskaan kirjoiteta tiedostoihin tai chattiin. Selaimessa olevat Supabase anon/publishable-avain ja Web3Forms-avain ovat julkisia, ja se on tarkoituksellista.
6. **Henkilötiedot:** liidit (`leads`) sisältävät asiakkaiden nimiä, sähköposteja ja puhelinnumeroita. Raporteissa ja logeissa vain lukumääriä, ei yksittäisiä asiakastietoja.
7. Kysy ennen kaikkea peruuttamatonta tai ulospäin näkyvää (julkaisu, viestin lähetys, poisto).

## Referenssit

Referenssit ovat ylläpidosta hallittavia (taulu `reference_cases`, sivut `referenssit.html` + `referenssi.html?r=slug`, ylläpito `admin/references.html`). Älä tee referenssisivuja käsin HTML:nä; muutokset sivupohjaan tehdään `assets/js/references.js`:ään, jolloin ne koskevat kaikkia referenssejä. Uuden referenssin lisäys: ylläpidossa + osoite käsin `sitemap.xml`:ään.

## Ympäristöt ja testaus

Tuotanto = `main` + tuotanto-Supabase. **Localhost käyttää automaattisesti PAIKALLISTA testi-Supabasea (Docker)**, ei tuotantoa; ks. `docs/ymparistot.md` (käynnistys: `supabase start ...`, `python3 scripts/local_setup.py`, `python3 scripts/dev_server.py 8099`). Lomakkeet ja ylläpitomuokkaukset ovat turvallisia testata localhostissa. Älä kirjoita koskaan tuotantotietokantaan testitarkoituksessa. Tietokantamuutokset: ensin paikalliseen, sitten tuotantoon (käyttäjä ajaa).

## Dokumentaation ylläpito (pakollinen)

Dokumentaation pitää vastata tuotantotilaa. **Jokaisen muutoksen yhteydessä** (samassa commitissa/PR:ssä):
1. Aja `python3 scripts/update_docs.py` ja commitoi päivittynyt `docs/TILA.md` (generoitu, älä muokkaa käsin). Tarkistus: `python3 scripts/update_docs.py --check`. Paikallinen git-hook (`.githooks/pre-commit`, ota käyttöön: `git config core.hooksPath .githooks`) tekee tämän automaattisesti; pilvisessioissa se on ajettava käsin.
2. Päivitä käsin kirjoitetut selitykset, jos muutos koskee niitä: tietokantamuutos -> `docs/tietokanta.md` (+ migraatiotiedosto), tietoturva -> `docs/tietoturva.md`, arkkitehtuuri/reititys/SEO/CMS -> `docs/arkkitehtuuri.md`, ajastetut agentit -> `docs/agentit.md`.
3. Mainitse PR-kuvauksessa, mitkä dokumentit päivitettiin.
Jos muutos tehdään suoraan Supabasessa (käsin) ilman repomuutosta, kirjaa se `docs/tietokanta.md`:hen ja migraatiotiedostoksi.

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
python3 scripts/dev_server.py 8080   # avaa http://localhost:8080 (puhtaat URLit kuten GitHub Pagesissa)
```

- Testaa muutos selaimessa ennen PR:ää (desktop + mobiili). Tarkista konsolista virheet.
- Puhdas URL `/kohteet/<slug>` toimii myös paikallisesti (`scripts/dev_server.py` käyttäytyy kuin GitHub Pages: palauttaa 404.html:n ja reititys ohjaa kohdesivulle).
- Uusi sivu: kopioi rakenne `tarinamme.html`:stä, lisää `data-cms`-attribuutit, lisää `sitemap.xml`:ään ja admin-listaan, aja `node update_nav.js` jos admin-navigaatio muuttuu.
- Kirjoita commit-viestit muotoon `feat:`, `fix:`, `perf:`, `docs:` (kuten historiassa). Sivuston sisältö ja käyttäjille näkyvät tekstit ovat suomeksi.

## Tietokantaoikeudet (tärkeä)

Ylläpito = kirjautunut + sähköposti taulussa `admin_users` (`public.is_site_admin()`). Julkinen (anon) saa vain lukea julkaistut kohteet ja `pages` sekä lisätä liidin/sivukatselun. Älä koskaan lisää julkisia (anon) UPDATE/DELETE/SELECT-käytäntöjä leads-, projects-, pages-, page_views- tai admin_users-tauluihin. Samassa Supabase-projektissa on toisen sovelluksen tauluja (contractors, labor_logs, project_*, safety_inspections, site_diaries, tasks): älä koske niihin. Kaikki DB-datan renderöinti `innerHTML`:llä pitää escapeta (`esc()` admin.js:ssä). Katso `docs/tietoturva.md`.

## Tunnetut huomiot (tarkistettava)

- `.env.local` on versionhallinnassa (sisältää vain julkiset avaimet; ei käytössä staattisella sivustolla). Harkitse poistoa.
- README.md on vanhentunut (mainitsee mm. `kohdesivut/`, `valtti-tapa.html`).
- RLS-säännöt: `docs/tietoturva.md` listaa tarkastettavat kohdat. Selvitä todellinen tila Supabasesta ennen muutoksia.
