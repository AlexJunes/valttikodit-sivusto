# TILA – automaattisesti generoitu tuotantotila

> **Älä muokkaa käsin.** Tämä tiedosto luodaan komennolla `python3 scripts/update_docs.py` suoraan repon koodista, ja se päivitetään jokaisen muutoksen yhteydessä (ks. `CLAUDE.md`). Selitykset: `docs/arkkitehtuuri.md`, `docs/tietokanta.md`, `docs/tietoturva.md`, `docs/agentit.md`.

- **Domain (CNAME):** `www.valttikodit.fi`
- **404.html-reititys (`/kohteet/<slug>` -> `kohde.html?kohde=<slug>`):** kyllä

## Julkiset sivut

| Sivu | Title | Description (merkkiä) | Canonical | OG-tageja | h1 | Schema | Lomake | CMS-kenttiä |
|---|---|---|---|---|---|---|---|---|
| `404.html` | Ladataan kohdetta... | – | – | 0 | 0 | – | – | 0 |
| `index.html` | Valttikodit \| Laadukkaat ja ekologiset kodit | 95 | kyllä | 7 | 1 | kyllä | https://api.web3forms.com/submit | 33 |
| `kiitos.html` | Kiitos yhteydenotostasi! \| Valttikodit | – | – | 0 | 1 | – | – | 0 |
| `kohde.html` | Valttikodit Ennakkokohde | – | – | 0 | 1 | – | – | 0 |
| `kohde_test.html` | – | – | – | 0 | 0 | – | – | 0 |
| `kohteet.html` | Myytävät kohteet \| Valttikodit | 118 | kyllä | 7 | 1 | – | – | 0 |
| `ostamme-tontteja.html` | Ostamme tontteja \| Valttikodit | 141 | kyllä | 7 | 1 | – | https://api.web3forms.com/submit | 43 |
| `referenssi.html` | Referenssi \| Valttikodit | 85 | kyllä | 7 | 0 | – | – | 0 |
| `referenssit.html` | Referenssit \| Valttikodit | 141 | kyllä | 7 | 1 | – | – | 4 |
| `tarinamme.html` | Tarinamme \| Valttikodit | 123 | kyllä | 7 | 1 | – | – | 34 |
| `tietosuojaseloste.html` | Tietosuojaseloste \| Valttikodit | 111 | kyllä | 7 | 1 | – | – | 0 |
| `yhteys.html` | Ota yhteyttä \| Valttikodit | 117 | kyllä | 7 | 1 | – | https://api.web3forms.com/submit | 7 |

### CMS-kentät (`data-cms`) sivuittain

- `index.html`: Ensivaikutelmia Otsikko, FAQ 1 Kysymys, FAQ 1 Vastaus, FAQ 2 Kysymys, FAQ 2 Vastaus, FAQ 3 Kysymys, FAQ 3 Vastaus, FAQ Otsikko, Hero Otsikko, Hero Taustakuva, Hero Teksti, Keskustelu Otsikko, Keskustelu Teksti, Kohteet Otsikko, Kohteet Teksti, Palaute 1 Lähde, Palaute 1 Teksti, Palaute 2 Lähde, Palaute 2 Teksti, Palaute 3 Lähde, Palaute 3 Teksti, Palvelu 1 Otsikko, Palvelu 1 Teksti, Palvelu 2 Otsikko, Palvelu 2 Teksti, Palvelu 3 Otsikko, Palvelu 3 Teksti, Palvelut Otsikko, Palvelut Teksti, Tunnelaatikko Kuva, Tunnelaatikko Lainaus, Tunnelaatikko Otsikko, Tunnelaatikko Teksti | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `kohde.html`:  | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `kohteet.html`:  | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `ostamme-tontteja.html`: Edut Ingressi, Edut Otsikko, Etsimme 1 Otsikko, Etsimme 1 Teksti, Etsimme 2 Otsikko, Etsimme 2 Teksti, Etsimme 3 Otsikko, Etsimme 3 Teksti, Etsimme 4 Otsikko, Etsimme 4 Teksti, Etsimme Otsikko, Etu 1 Otsikko, Etu 1 Teksti, Etu 2 Otsikko, Etu 2 Teksti, Etu 3 Otsikko, Etu 3 Teksti, Hero Otsikko, Hero Teksti, Lomake Ingressi, Lomake Lisäteksti, Lomake Otsikko, Miksi Otsikko, Miksi Teksti 1, Miksi Teksti 2, Prosessi Otsikko, UKK 1 Kysymys, UKK 1 Vastaus, UKK 2 Kysymys, UKK 2 Vastaus, UKK 3 Kysymys, UKK 3 Vastaus, UKK 4 Kysymys, UKK 4 Vastaus, UKK Otsikko, Vaihe 1 Otsikko, Vaihe 1 Teksti, Vaihe 2 Otsikko, Vaihe 2 Teksti, Vaihe 3 Otsikko, Vaihe 3 Teksti, Vaihe 4 Otsikko, Vaihe 4 Teksti | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `referenssi.html`:  | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `referenssit.html`: Ingressi, Loppuosio Otsikko, Loppuosio Teksti, Otsikko | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `tarinamme.html`: Arvot Henkilö, Arvot Lainaus, Arvot Otsikko, Ensimmäinen Otsikko, Ensimmäinen Teksti, H1 Kuva, H1 Nimi, H1 Titteli, H2 Kuva, H2 Nimi, H2 Titteli, H3 Kuva, H3 Nimi, H3 Titteli, H4 Kuva, H4 Nimi, H4 Titteli, Kolmas Otsikko, Kolmas Teksti, P1 Otsikko, P1 Teksti, P2 Otsikko, P2 Teksti, P3 Otsikko, P3 Teksti, P4 Otsikko, P4 Teksti, Prosessi Otsikko, Tarinamme Ingressi, Tarinamme Otsikko, Tarinan Kuva, Tiimi Otsikko, Toinen Otsikko, Toinen Teksti | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `tietosuojaseloste.html`:  | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti
- `yhteys.html`: Kuvaus, Lomake Otsikko, Osoite, Otsikko, Puhelinnumero, Sähköposti, Yhteystiedot Otsikko | globaalit: Alatunniste: Facebook-linkki, Alatunniste: Instagram-linkki, Alatunniste: LinkedIn-linkki, Alatunniste: Osoite, Alatunniste: Postitoimipaikka, Alatunniste: Puhelinnumero, Alatunniste: Sähköposti

## Ylläpitosivut (`admin/`)

- `admin/analytics.html` – Analytiikka \| Valttikodit Admin
- `admin/dashboard.html` – Admin Dashboard \| Valttikodit
- `admin/edit-index.html` – Muokkaa: Kotiranta \| Valttikodit Admin
- `admin/edit-page.html` – Muokkaa Sivua \| Valttikodit Admin
- `admin/edit-project.html` – Muokkaa: Kotiranta \| Valttikodit Admin
- `admin/edit-reference.html` – Muokkaa referenssiä \| Valttikodit Admin
- `admin/login.html` – Admin Kirjautuminen \| Valttikodit
- `admin/pages.html` – Sivut Hallinta \| Valttikodit Admin
- `admin/projects.html` – Kohteet Hallinta \| Valttikodit Admin
- `admin/references.html` – Referenssit \| Valttikodit Admin
- `admin/users.html` – Käyttäjien Hallinta \| Valttikodit Admin

## JavaScript: tietokanta- ja selaintallennuskäyttö

| Tiedosto | Taulut (operaatiot) | RPC | Storage | local/sessionStorage-avaimet |
|---|---|---|---|---|
| `assets/js/admin-references.js` | projects (select); reference_cases (delete, insert, select, update) | – | images | – |
| `assets/js/admin.js` | admin_users (delete, insert, select); leads (delete, select, update); page_views (select); pages (insert, select, update); projects (delete, insert, select, update) | – | images | valtti_admin_auth, valtti_admin_login_time |
| `assets/js/analytics-dashboard.js` | leads (select); page_views (select) | – | – | – |
| `assets/js/config.js` | – | – | – | – |
| `assets/js/main.js` | leads (insert); page_views (insert); pages (select); projects (select) | – | – | v_session, valttikodit_cookie_consent |
| `assets/js/references.js` | reference_cases (select) | – | – | – |

## Ulkoiset riippuvuudet (isännät HTML:ssä)

- https://cdn.jsdelivr.net
- https://fonts.googleapis.com
- https://fonts.gstatic.com
- https://unpkg.com
- https://www.google.com
- https://www.valttikodit.fi

## Sitemap ja robots

- https://www.valttikodit.fi/
- https://www.valttikodit.fi/kohteet.html
- https://www.valttikodit.fi/tarinamme.html
- https://www.valttikodit.fi/yhteys.html
- https://www.valttikodit.fi/referenssit.html
- https://www.valttikodit.fi/referenssi.html?r=sudenkorento-6-a-ja-b
- https://www.valttikodit.fi/ostamme-tontteja.html
- https://www.valttikodit.fi/kohde.html?kohde=kotiranta
- https://www.valttikodit.fi/kohde.html?kohde=kotiranta_b
- https://www.valttikodit.fi/kohde.html?kohde=saunaranta_a
- https://www.valttikodit.fi/kohde.html?kohde=saunaranta_b
- https://www.valttikodit.fi/kohde.html?kohde=hieroja3
- https://www.valttikodit.fi/tietosuojaseloste.html

robots.txt:

```
User-agent: *
Allow: /

Disallow: /admin/
Disallow: /kiitos.html

Sitemap: https://www.valttikodit.fi/sitemap.xml
```

## Tietokantamigraatiot (supabase/migrations)

Lueteltu tiedostot, jotka on kirjattu repoon. Tuotantoon ne ajetaan käsin Supabase SQL Editorissa; ks. `docs/tietokanta.md`.

- `2026-10-10_report_weekly.sql` – ==============================================================================
- `2026-10-10_secure_rls.sql` – ==============================================================================
- `2026-10-11_reference_cases.sql` – ==============================================================================
- `2026-10-11_seed_sudenkorento.sql` – Esimerkkidata: ensimmainen referenssi (Sudenkorento 6 A ja B). Ajetaan vasta kun reference_cases-taulu on luotu.

## Repon rakenne (ylin taso)

- `.claude/`
- `.githooks/`
- `.gitignore`
- `404.html`
- `CLAUDE.md`
- `CNAME`
- `README.md`
- `admin/`
- `app/`
- `assets/`
- `docs/`
- `index.html`
- `kiitos.html`
- `kohde.html`
- `kohde_test.html`
- `kohteet.html`
- `ostamme-tontteja.html`
- `referenssi.html`
- `referenssit.html`
- `robots.txt`
- `scripts/`
- `sitemap.xml`
- `supabase/`
- `tarinamme.html`
- `tietosuojaseloste.html`
- `update_nav.js`
- `utils/`
- `yhteys.html`
