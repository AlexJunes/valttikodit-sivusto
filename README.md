# Valttikodit - Tuotantovalmis Verkkosivusto (Staattinen HTML + BaaS)

Tämä projekti sisältää Valttikotien verkkosivuston, joka on suunniteltu modernilla, saavutettavalla ja skandinaavisella otteella **ilman tarvetta Node.js-ympäristöön, NPM:ään tai monimutkaisiin build-vaiheisiin**. 

## Arkkitehtuuri
- **Frontend (Julkinen sivusto & Admin paneeli):** Puhdas HTML5, Custom CSS ja Vanilla JavaScript. Tämä varmistaa salamannopeat latausajat, helpon siirrettävyyden mihin tahansa webhotelliin ja pitkän elinkaaren ilman riippuvuuksien päivittämistä.
- **Liidit:** Integroitu [Web3Forms](https://web3forms.com/) -palveluun (Ilmainen, suora sähköpostilähetys selaimesta).
- **Backend/Tietokanta (Valinnainen):** Koodiin on jätetty asetusvalmiudet **Supabase** BaaS (Backend as a Service) -palvelun käyttöönottoon, joka mahdollistaisi täysin selaimesta käsin toimivan hallintapaneelin. Nyt kohteet ovat ensisijaisesti staattisessa muodossa ja admin-paneeli on UI-tasolla valmiudessa.

## Hakemistorakenne
- `index.html` - Etusivu
- `kohteet.html` - Myytävät kohteet listaus
- `kohdesivut/` - Yksittäisten kohteiden sivut (esim. `kotiranta.html`)
- `valtti-tapa.html` - Tarinamme
- `yhteys.html` - Yhteystiedot ja lomake
- `admin/` - Admin-paneelin HTML-tiedostot (kirjautuminen, kojelauta, kohteet)
- `assets/`
  - `css/style.css` - Sivuston laadukas design-järjestelmä
  - `css/admin.css` - Admin-portaalin tyylit
  - `js/main.js` - Julkisen puolen javascript logiikka
  - `js/admin.js` - Hallintapaneelin logiikka ja auth
  - `js/config.js` - API ja ydinasetukset (Supabase)

## Käyttöönotto
Koska sivusto on silkkaa staattista tiedostoa, **mitään ei tarvitse kääntää tai "buildata"**.

1. **Julkaisu:** Avaa vain `index.html` selaimessa tarkastellaksesi sivua paikallisesti, tai siirrä koko `valttikodit/` kansion sisältö verkkohotellisi (esim. Hostinger, cPanel, FTP) `public_html` -kansioon. Se on heti täysin toimiva.
2. **Liidien aktivointi:**
   Mene osoitteeseen `yhteys.html` sivun koodiin. Luo ilmainen avain osoitteessa [web3forms.com](https://web3forms.com/) ja syötä se `yhteys.html` -lomakkeessa kohtaan:
   `<input type="hidden" name="access_key" value="TÄHÄN_ACCESS_KEY">`
3. **SEO**
   Päivitä `sitemap.xml` ja `robots.txt` tarvittaessa kun lisäät uusia kohdesivuja manuaalisesti.

## Ylläpito-ohje: Uuden kohteen lisääminen (Manuaalinen staattinen tapa)
Koska varsinaista tietokantaa ei ole asennettu lokaalien Node/NPM riippuvuuksien puutteen vuoksi:

1. Mene kansioon `/kohdesivut/`.
2. Kopioi `kotiranta.html` ja nimeä se uudelleen (esim. `uusi-kohde.html`).
3. Avaa `uusi-kohde.html` editorissa ja vaihda tekstit:
   - `<title>Yksittäinen Kohde` -> `<title>Uusi Kohde`
   - Kohde Hero tekstit ja hinta/osoitetiedot koodista.
4. Avaa `kohteet.html` ja lisää kohteiden `<div class="card-grid">` listaukseen uusi `<a href="kohdesivut/uusi-kohde.html" class="card">...</a>` lohko kopioimalla edellinen.

*(Admin-portaali ohjelmistointegraatio jätettiin UI-tasolle `admin/` kansioon, koska todellista kantaa tai frameworkkiä ei pystytetty tietoturvalistojen ja teknisten rajoitteiden vuoksi.)*

# valttikodit-sivusto
