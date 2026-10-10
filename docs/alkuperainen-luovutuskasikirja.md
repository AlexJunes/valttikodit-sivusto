# VALTTIKODIT.FI – TÄYDELLINEN JÄRJESTELMÄN JA ARKKITEHTUURIN LUOVUTUSKÄSIKIRJA (MASTER SYSTEM HANDOVER FOR CLAUDE)

**Kohde-entiteetti:** [www.valttikodit.fi](https://www.valttikodit.fi)  
**GitHub-repositorio:** `AlexJunes/valttikodit-sivusto` (`main`-haara)  
**BaaS-alusta (Backend):** Supabase (`https://xbeonksexpjvekqjxoph.supabase.co`)  
**Dokumentin versio:** 2.0 (Laajennettu Master-taso)  
**Päivitetty:** Lokakuu 2026  
**Kohderyhmä:** Tekoälyagentti (Claude) ja järjestelmäarkkitehdit, jotka ottavat kokonaisuuden suoran hallinnan, kehityksen ja ylläpidon.

---

## SISÄLLYSLUETTELO
1. [Yleiskuvaus ja Arkkitehtuurifilosofia](#1-yleiskuvaus-ja-arkkitehtuurifilosofia)
2. [Ekosysteemin Kolmiyhteys & Yhteysasetukset](#2-ekosysteemin-kolmiyhteys--yhteysasetukset)
3. [Tiedostohierarkia ja Komponenttien Roolit](#3-tiedostohierarkia-ja-komponenttien-roolit)
4. [Reititysarkkitehtuuri ja GitHub Pages 404 -reititin](#4-reititysarkkitehtuuri-ja-github-pages-404--reititin)
5. [Täydellinen Tietokantasäännöstö ja SQL DDL (Valmis Migraatio)](#5-t%C3%A4ydellinen-tietokantas%C3%A4%C3%A4nn%C3%B6st%C3%B6-ja-sql-ddl-valmis-migraatio)
6. [Tietoturva, Row Level Security (RLS) ja MFA-kirjautuminen](#6-tietoturva-row-level-security-rls-ja-mfa-kirjautuminen)
7. [Dynaaminen CMS-koneisto (`data-cms`)](#7-dynaaminen-cms-koneisto-data-cms)
8. [Asuntokohteiden Elinkaari ja Renderöintilogiikka](#8-asuntokohteiden-elinkaari-ja-render%C3%B6intilogiikka)
9. [Liidiputki, Lomakkeet ja Web3Forms-integraatio](#9-liidiputki-lomakkeet-ja-web3forms-integraatio)
10. [Evästehallinta, GDPR ja Sisäänrakennettu Analytiikka](#10-ev%C3%A4stehallinta-gdpr-ja-sis%C3%A4%C3%A4nrakennettu-analytiikka)
11. [SEO, Tekoäly-SEO ja Strukturoitu Data (Schema.org)](#11-seo-teko%C3%A4ly-seo-ja-strukturoitu-data-schemaorg)
12. [Clauden Operatiivinen Käsikirja (Step-by-Step Playbook)](#12-clauden-operatiivinen-k%C3%A4sikirja-step-by-step-playbook)
13. [MCP (Model Context Protocol) ja Työkalukonfiguraatio](#13-mcp-model-context-protocol-ja-ty%C3%B6kalukonfiguraatio)
14. [Vianetsintä ja Hätätilanneohjeet (Troubleshooting)](#14-vianetsint%C3%A4-ja-h%C3%A4t%C3%A4tilanneohjeet-troubleshooting)

---

## 1. YLEISKUVAUS JA ARKKITEHTUURIFILOSOFIA

Valttikodit Oy:n verkkopalvelu on korkean suorituskyvyn, modernin skandinaavisen asuntotuotannon ja -myynnin digitaalinen alusta. Se palvelee sekä kuluttajia (asuntojen etsijät, esitteiden lataajat, varauksen tekijät) että yrityksen omaa henkilöstöä (sisällöntuotanto, liidien käsittely, analytiikkaseuranta).

### Keskeiset Arkkitehtuuriperiaatteet:
1. **Zero-Build Jamstack:**
   - Sivusto on rakennettu puhtaalla HTML5-, CSS- ja Vanilla JavaScript (ES6+) -pohjalla.
   - **Ei Webpackia, ei Viteä, ei monimutkaista Node-käännöstä tuotannossa.** Jokainen tiedosto toimitetaan selaimelle sellaisenaan. Tämä takaa 100 % luotettavuuden: koodissa ei voi tapahtua "käännösajan hajoamista" (build failures).
   - *(Huomautus Claudelle: kansioissa `app/` ja `utils/` olevat tiedostot ovat Next.js-kokeilujen jäänteitä eivätkä osallistu tuotantosivuston toimintaan. Älä koskaan yritä ajaa `next build` tai muuttaa tuotantoprojektia Next.js-sovellukseksi, ellei käyttäjä sitä erikseen määrää.)*
2. **BaaS-pohjainen Reaktiivisuus (Supabase):**
   - Vaikka sivusto on staattisesti hostattu, se on toiminnallisesti **täysin dynaaminen**.
   - Supabase toimii reaaliaikaisena tietokantana (PostgreSQL), todennusjärjestelmänä (Auth + MFA) ja tiedostopalvelimena (Storage).
3. **Välitön Julkaisuputki (Push-to-Deploy):**
   - GitHub toimii ainoana totuuden lähteenä (Single Source of Truth). Jokainen `git push origin main` julkaisee sivuston välittömästi osoitteeseen `www.valttikodit.fi`.

---

## 2. EKOSYSTEEMIN KOLMIYHTEYS & YHTEYSASETUKSET

```mermaid
graph TD
    ClientBrowser[Asiakkaan Selain] <-->|HTTPS| CloudflareGitHub[GitHub Pages / www.valttikodit.fi]
    AdminBrowser[Ylläpitäjän Selain] <-->|MFA Auth / HTTPS| AdminArea[www.valttikodit.fi/admin/]
    
    subgraph GitHubRepo ["1. GitHub-repositorio (AlexJunes/valttikodit-sivusto)"]
        MainBranch[Branch: main]
        CNAMEFile[CNAME: www.valttikodit.fi]
        Routing404[404.html Reitityksen Fallback]
    end

    subgraph SupabaseCloud ["2. Supabase BaaS (xbeonksexpjvekqjxoph)"]
        DB[(PostgreSQL 15+)]
        AuthService[Auth MFA Engine]
        StorageBucket[Storage: images]
    end

    subgraph LeadPipeline ["3. Liidien Notifikaatioputki"]
        W3F[Web3Forms REST API]
        AdminMailbox[(Ylläpidon sähköposti)]
    end

    CloudflareGitHub --> MainBranch
    ClientBrowser -->|Lue kohteet & CMS, tallenna liidi & pageview| DB
    AdminArea -->|MFA-varmennus| AuthService
    AdminArea -->|Kohteet, CMS, Liidien tila| DB
    AdminArea -->|Kuvat & PDF-materiaalit| StorageBucket
    ClientBrowser -->|Sähköposti-ilmoitus liidistä| W3F --> AdminMailbox
```

### Konfiguraatioarvot:
* **GitHub Repository URL:** `https://github.com/AlexJunes/valttikodit-sivusto.git`
* **Päähaara:** `main`
* **Custom Domain:** `www.valttikodit.fi` (ohjattu `CNAME`-tiedostolla)
* **Supabase Project URL:** `https://xbeonksexpjvekqjxoph.supabase.co`
* **Supabase Project Reference ID:** `xbeonksexpjvekqjxoph`
* **Supabase Public Anon Key:** `sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn`
* **Web3Forms Access Key:** `fa637672-a5ba-4717-8464-d1d29719c87b`
* **Supabase CDN SDK:** `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`

---

## 3. TIEDOSTOHIERARKIA JA KOMPONENTTIEN ROOLIT

```
valttikodit-sivusto/
├── CNAME                           # Määrittää GitHub Pagesille domainin: www.valttikodit.fi
├── .env.local                      # Ympäristömuuttujat kehitykseen
├── 404.html                        # GitHub Pages SPA-reititin (Clean URLs -> /kohde.html?kohde=slug)
├── robots.txt                      # Hakukonerajoitteet (estää mm. /admin/ ja /kiitos.html)
├── sitemap.xml                     # Hakukoneiden sivukartta
├── update_nav.js                   # Node-skripti admin-navigaation automaattiseen synkronointiin
│
├── index.html                      # Pääsivusto: Hero, arvolupaus, dynaamiset kohdenostot
├── kohteet.html                    # Kaikkien myytävien kohteiden hakulistaus ja suodatus
├── kohde.html                      # Dynaaminen kohdesivupohja (renderöi kohteen ?kohde=slug mukaan)
├── kohde_test.html                 # Tyhjä testitiedosto (voidaan poistaa tai käyttää luonnosteluun)
├── tarinamme.html                  # Bränditarina, Valtti-tapa, rakentamisen laatu
├── yhteys.html                     # Yhteystiedot ja suora yhteydenottolomake
├── kiitos.html                     # Lomakkeen onnistumisen kiitossivu
├── tietosuojaseloste.html          # GDPR-tietosuojaseloste ja rekisteriseloste
│
├── admin/                          # HALLINTAPANEELI (Suojattu Supabase Auth + TOTP MFA)
│   ├── login.html                  # Sisäänkirjautuminen, salasanan palautus, TOTP QR/koodi
│   ├── dashboard.html              # Saapuneet liidit, käsittelytila ('UUSI' / 'KÄSITELTY')
│   ├── projects.html               # Kohteiden hallinta, julkaisukytkimet, järjestely
│   ├── edit-project.html           # Yksittäisen kohteen täysi muokkaus (53 kenttää + uploadit)
│   ├── pages.html                  # CMS-sivujen listaus
│   ├── edit-page.html              # Yleinen dynaaminen sivueditori (avain-arvo)
│   ├── edit-index.html             # Etusivun räätälöity visuaalinen tekstieditori
│   ├── users.html              # Ylläpitäjätunnusten hallinta
│   └── analytics.html              # Sisäinen analytiikkanäkymä (Chart.js)
│
├── assets/
│   ├── css/
│   │   ├── style.css               # Julkisen sivuston koko design-järjestelmä
│   │   └── admin.css               # Hallintapaneelin erilliset käyttöliittymätyylit
│   ├── js/
│   │   ├── config.js               # Supabase-konfiguraatio ja alustus
│   │   ├── main.js                 # Julkisen puolen ydin: CMS, Kohteet, Liidit, Evästeet, Analytiikka
│   │   ├── admin.js                # Admin-portaalin logiikka: Auth, MFA, CRUD, Storage Upload
│   │   └── analytics-dashboard.js  # Analytiikan laskenta ja graafien piirto (Chart.js)
│   └── img/                        # Kuvat, logot, pohjakuvat ja esimerkkimateriaalit
│
├── app/                            # (Legacy Next.js kokeilu – ÄLÄ KOSKE / ÄLÄ KÄYTÄ TUOTANNOSSA)
│   └── page.tsx
└── utils/                          # (Legacy Next.js kokeilu – ÄLÄ KOSKE / ÄLÄ KÄYTÄ TUOTANNOSSA)
    └── supabase/
```

---

## 4. REITITYSARKKITEHTUURI JA GITHUB PAGES 404 -REITITIN

GitHub Pages on staattinen tiedostopalvelin, joka ei luonnostaan tue palvelinpuolen URL-uudelleenkirjoituksia (`rewrite`). Tämän vuoksi olemme toteuttaneet **älykkään asiakaspuolen reititysjärjestelmän**:

### Miten puhdas URL toimii:
1. Käyttäjä menee suoraan osoitteeseen: `https://www.valttikodit.fi/kohteet/limingan-kotiranta`
2. Koska tiedostojärjestelmässä ei ole kansiota `/kohteet/limingan-kotiranta`, GitHub Pages palauttaa tiedoston `404.html`.
3. `404.html` sisältää reititysskriptin:
   ```javascript
   var path = window.location.pathname;
   if (path.startsWith('/kohteet/') && path.length > 9) {
       var slug = path.substring(9).replace(/\/$/, '');
       window.location.replace('/kohde.html?kohde=' + slug + '&rewrite=true');
   } else {
       window.location.replace('/?404=true');
   }
   ```
4. Selain lataa sivun `kohde.html?kohde=limingan-kotiranta&rewrite=true`.
5. Tiedostossa `assets/js/main.js` reititin havaitsee parametrin:
   ```javascript
   if (urlParams.get('rewrite') === 'true') {
       window.history.replaceState({}, '', `/kohteet/${slug}`);
   }
   ```
6. **Lopputulos:** Käyttäjän osoitepalkissa lukee puhdas `/kohteet/limingan-kotiranta` ilman sivun uudelleenlatausta, ja oikea kohde renderöityy salamannopeasti!

> **Kriittinen sääntö Claudelle:** Älä koskaan poista tai muuta `404.html`-tiedoston logiikkaa, ellei koko hosting-alustaa vaihdeta.

---

## 5. TÄYDELLINEN TIETOKANTASÄÄNNÖSTÖ JA SQL DDL (VALMIS MIGRAATIO)

Alla on täydellinen, suoraan Supabasen SQL Editorissa ajettava SQL-skripti, joka määrittelee kaikki taulut, sarakkeet, indeksit ja oletusarvot:

```sql
-- ==============================================================================
-- VALTTIKODIT.FI - DATABASE SCHEMA DDL
-- ==============================================================================

-- 1. TAULU: projects (Asuntokohteet)
CREATE TABLE IF NOT EXISTS public.projects (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    location TEXT,
    address TEXT,
    area TEXT,
    area_other TEXT,
    type TEXT,
    price NUMERIC,
    status TEXT DEFAULT 'AVAILABLE', -- 'MARKETING', 'AVAILABLE', 'CONSTRUCTION', 'RESERVED', 'SOLD'
    room_setup TEXT,
    ingress TEXT,
    description TEXT,
    published BOOLEAN DEFAULT false,
    hero_image TEXT,
    gallery_images JSONB DEFAULT '[]'::jsonb,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON public.projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_published ON public.projects(published);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- 2. TAULU: pages (Dynaaminen CMS)
CREATE TABLE IF NOT EXISTS public.pages (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE, -- 'index', 'valtti-tapa', 'yhteys', 'kohde'
    content JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON public.pages(slug);

-- 3. TAULU: leads (Asiakasyhteydenotot ja varaukset)
CREATE TABLE IF NOT EXISTS public.leads (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    status TEXT DEFAULT 'UUSI' NOT NULL -- 'UUSI', 'KÄSITELTY'
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

-- 4. TAULU: page_views (GDPR-analytiikka)
CREATE TABLE IF NOT EXISTS public.page_views (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    path TEXT NOT NULL,
    session_id TEXT,
    device_type TEXT,
    referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON public.page_views(path);

-- 5. TAULU: admin_users (Ylläpitäjät)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    role TEXT DEFAULT 'admin' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

---

## 6. TIETOTURVA, ROW LEVEL SECURITY (RLS) JA MFA-KIRJAUTUMINEN

### 6.1. RLS-Käytännöt (Production-Grade Security)
Aja seuraavat SQL-käskyt Supabasessa varmistaaksesi, että anonyymit käyttäjät eivät voi koskaan lukea muiden liidejä tai muuttaa sivuston sisältöä:

```sql
-- Otetaan RLS käyttöön kaikissa tauluissa
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 1. PROJECTS: Kaikki voivat lukea julkaistuja, vain kirjautuneet voivat muokata
CREATE POLICY "Public read published projects" ON public.projects
    FOR SELECT USING (published = true OR auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access to projects" ON public.projects
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. PAGES: Kaikki voivat lukea CMS-sisältöä, vain kirjautuneet voivat muokata
CREATE POLICY "Public read pages" ON public.pages
    FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated full access to pages" ON public.pages
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. LEADS: Julkinen voi vain lisätä (INSERT), vain kirjautuneet voivat lukea/päivittää/poistaa
CREATE POLICY "Public insert leads" ON public.leads
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Authenticated read and manage leads" ON public.leads
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. PAGE_VIEWS: Julkinen voi lisätä katseluita, vain kirjautuneet voivat analysoida
CREATE POLICY "Public insert page views" ON public.page_views
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Authenticated view analytics" ON public.page_views
    FOR SELECT TO authenticated USING (true);

-- 5. ADMIN_USERS: Vain todennetut ylläpitäjät näkevät ja hallitsevat
CREATE POLICY "Authenticated admin users access" ON public.admin_users
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 6.2. Supabase Storage RLS (Bucket: `images`)
Aseta bucket julkiseksi kuvien latausta varten:
```sql
-- Sallitaan julkinen luku kaikille tiedostoille images-ämpärissä
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'images');

-- Vain kirjautuneet saavat ladata ja poistaa kuvia
CREATE POLICY "Authenticated Upload" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'images');

CREATE POLICY "Authenticated Delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'images');
```

### 6.3. Admin MFA (Multi-Factor Authentication) -toimintaperiaate
1. **Kirjautuminen:** Käyttäjä syöttää sähköpostin ja salasanan osoitteessa `/admin/login.html`.
2. **Faktoritarkistus (`supabase.auth.mfa.listFactors`):**
   - Jos vahvistettu TOTP-tekijä löytyy, näytetään 6-numeroisen koodin syöttölomake (`supabase.auth.mfa.challenge` + `verify`).
   - Jos käyttäjällä ei ole vielä MFA:ta, luodaan uusi TOTP-tekijä (`supabase.auth.mfa.enroll`), generoidaan QR-koodi ruudulle ja pyydetään skannaamaan se Authenticator-sovellukseen (Google Authenticator, 1Password tms.).
3. **Session suojaus:** Jokaisella admin-sivulla `admin.js` tarkistaa istunnon AAL-tason (`getAuthenticatorAssuranceLevel`). Jos taso ei ole `aal2`, sivu ohjaa takaisin kirjautumiseen.

---

## 7. DYNAAMINEN CMS-KONEISTO (`data-cms`)

Sivuston ytimessä on DOM-pohjainen sisällönhallintajärjestelmä.

### 7.1. Miten elementti sidotaan CMS:ään:
Kirjoita mihin tahansa HTML-tiedostoon elementti attribuutilla `data-cms`:
```html
<!-- Tavallinen teksti -->
<h1 data-cms="Hero Otsikko">Oletusotsikko, joka näkyy ennen tietokantahakua</h1>

<!-- Kuva -->
<img data-cms="Etusivun Pääkuva" src="assets/img/default.jpg" alt="Pääkuva">

<!-- Taustakuva (inline style background-image) -->
<section data-cms="Hero Tausta" style="background-image: url('assets/img/hero-bg.jpg');">

<!-- Monirivinen lista (muunnetaan luetteloksi) -->
<div data-cms="Valttiedut Lista" data-list></div>
```

### 7.2. Suorituskykyoptimoitu Renderöinti:
1. `main.js` lukee ensin selaimen `sessionStorage`-välimuistin (`cms_{slug}`).
2. Jos välimuistissa on dataa, elementit päivitetään **0 millisekunnissa**, jolloin sivulla ei tapahdu sisällön välkkymistä (Zero Layout Shift).
3. Taustalla suoritetaan asynkroninen Supabase-kysely:
   ```javascript
   supabase.from('pages').select('content').eq('slug', slug).maybeSingle()
   ```
4. Jos sisältö on muuttunut, DOM päivitetään saumattomasti ja välimuisti synkronoidaan.

---

## 8. ASUNTOKOHTEIDEN ELINKAARI JA RENDERÖINTILOGIIKKA

### 8.1. Kohteen Tilat (Status Lifecycle)
- `MARKETING` (Ennakkomarkkinointi): Kohde esitellään, varauksia otetaan vastaan.
- `AVAILABLE` (Myynnissä): Kohde myynnissä.
- `CONSTRUCTION` (Rakenteilla): Kohde myynnissä ja rakennustyöt käynnissä. Valmiusaste-% näytetään edistymispalkissa.
- `RESERVED` (Varattu): Kohde on varattu, **varausnappi piilotetaan ja poistetaan DOMista**.
- `SOLD` (Myyty): Kohde näytetään erillisessä "Myydyt kohteet" -lohkossa vihreällä tunnisteella, **varausnappi poistetaan**.

### 8.2. Yksittäisen Kohdesivun (`kohde.html`) Komponentit:
- **Kuvakaruselli & Lightbox:** Yhdistää `hero_image`-kuvan ja `gallery_images`-taulukon kuvat yhteen responsiiviseen karuselliin. Kuvaa klikkaamalla avautuu koko ruudun kokoinen Lightbox.
- **Valmiusaste-indikaattori:** Jos `details['Valmiusaste (%)']` on määritelty, järjestelmä animoi visuaalisen etenemispalkin ja sytyttää virstanpylväspallukat (10%, 30%, 50%, 70%, 90%).
- **Sosiaalisen median nostot:** Näyttää automaattisesti Facebook- ja Instagram-painikkeet, jos linkit on syötetty ylläpidossa.
- **Materiaalipaketti ja PDF:** Jos kohteelle on ladattu esite tai PDF, latausnappi aktivoituu. Jos ei, nappi deaktivoituu siististi.
- **Google Maps:** Upotettu iframe suoraan `details['Google Maps Embed']` -kentästä.

---

## 9. LIIDIPUTKI, LOMAKKEET JA WEB3FORMS-INTEGRAATIO

Kaikki sivuston lomakkeet (`yhteys.html`, `kohde.html` varaus ja materiaalipaketti) noudattavat **Dual-Pipeline-periaatetta**:

```
[Käyttäjä täyttää lomakkeen]
          │
          ▼
[XSS- ja Sanitoinnin Tarkastus (main.js)]
          │
    ┌─────┴────────────────────────────────┐
    ▼                                      ▼
[1. Supabase 'leads'-taulu]       [2. Web3Forms API]
    - Tila: 'UUSI'                    - Lähettää välittömän
    - Tallessa Admin Dashboardia        sähköpostin Valttikotien
      ja raportteja varten              myyntitiimille
```

### Web3Forms Konfiguraatio:
- Endpoint: `https://api.web3forms.com/submit`
- Access Key: `fa637672-a5ba-4717-8464-d1d29719c87b`
- Metatiedot: Otsikko (`subject`), Asiakkaan nimi, Puhelin, Sähköposti ja Lähdetieto (esim. *"LÄHDE: Materiaalipaketin lataus (Kotiranta)"*).

---

## 10. EVÄSTEHALLINTA, GDPR JA SISÄÄNRAKENNETTU ANALYTIIKKA

Sivustolla on täysin omavarainen, Traficomin ja GDPR:n mukainen evästekoneisto ilman raskaita seurantaskriptejä (kuten Google Analytics):

1. **Evästebanneri:** Injektoidaan dynaamisesti `main.js`-tiedostosta, ellei käyttäjän valintaa löydy `localStorage`-avaimesta `valttikodit_cookie_consent`.
2. **Asetusvaihtoehdot:**
   - *Välttämättömät evästeet* (aina päällä).
   - *Analytiikkaevästeet* (valinnainen).
3. **Analytiikkaloki (`page_views`):**
   - Jos käyttäjä kieltää analytiikan, `session_id` jää tyhjäksi (anonyymi katseluloki).
   - Jos käyttäjä sallii analytiikan, luodaan anonyymi istuntotunniste `sessionStorage: v_session`.
   - Tallentaa: Sivupolun, laiteluokan (`Desktop`, `Mobiili`, `Tabletti`) ja viittaajan (`Suora`, `Sisäinen`, ulkoinen URL).
4. **Admin Dashboard (`analytics.html` & `analytics-dashboard.js`):**
   - Laskee KPI-luvut (kokonaiskatselut, uniikit sessiot, liidit ja konversioprosentin).
   - Piirtää Chart.js-graafit aikaväleittäin (7 pv, 30 pv, 90 pv, 365 pv).

---

## 11. SEO, TEKOÄLY-SEO JA STRUKTUROITU DATA (SCHEMA.ORG)

Sivusto on optimoitu sekä perinteisille hakukoneille (Google) että tekoälyhakukoneille (SearchGPT, Perplexity, Gemini):

### 1. Etusivun Schema (`index.html`):
```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": "Valttikodit Oy",
  "image": "https://valttikodit.fi/assets/img/hero-bg.jpg",
  "url": "https://valttikodit.fi"
}
```

### 2. Dynaaminen Asuntokohteen Schema (`kohde.html` / `main.js`):
Jokaiselle asunnolle generoidaan lennossa täydellinen `SingleFamilyResidence`-rakenne:
```json
{
  "@context": "https://schema.org",
  "@type": "SingleFamilyResidence",
  "name": "As Oy Limingan Kotiranta",
  "description": "...",
  "url": "https://www.valttikodit.fi/kohteet/limingan-kotiranta",
  "image": "https://...",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Rantatie 4",
    "addressLocality": "Liminka",
    "addressRegion": "Pohjois-Pohjanmaa",
    "addressCountry": "FI"
  },
  "floorSize": {
    "@type": "QuantitativeValue",
    "value": 105,
    "unitCode": "MTK"
  }
}
```

---

## 12. CLAUDEN OPERATIIVINEN KÄSIKIRJA (STEP-BY-STEP PLAYBOOK)

Tämä luku antaa Claudelle tarkat toimintaohjeet rutiinitehtäviin.

### 12.1. Paikallinen Testaus ja Esikatselu
Koska sivustolla ei ole Node-käännöstä, käynnistä paikallinen testipalvelin millä tahansa staattisella HTTP-palvelimella:
```bash
# Vaihtoehto A: Python 3
python3 -m http.server 8080

# Vaihtoehto B: Node npx serve
npx serve -l 8080 .
```
Avaa selaimessa: `http://localhost:8080`

### 12.2. Uuden Kohteen Luominen (Kooditietokanta vs. Admin)
- **Tapa A (Suositeltu):** Avaa `/admin/edit-project.html` selaimessa ja täytä tiedot. Se tallentaa automaattisesti Supabaseen ja lataa kuvat oikeaan ämpäriin.
- **Tapa B (Clauden suora SQL-syöttö):**
  ```sql
  INSERT INTO public.projects (
      title, slug, location, address, area, price, status, published, hero_image, details
  ) VALUES (
      'As Oy Oulun Metsätähti',
      'oulun-metsatahti',
      'Oulu',
      'Metsätähdentie 2, 90540 Oulu',
      '95 m²',
      315000,
      'MARKETING',
      true,
      'https://xbeonksexpjvekqjxoph.supabase.co/storage/v1/object/public/images/metsatahti_hero.jpg',
      '{"Järjestys": 1, "Tyyppi": "Omakotitalo", "Huoneita": "4"}'::jsonb
  );
  ```

### 12.3. Uuden Sivun Luominen ja Julkaisu
1. Luo uusi tiedosto, esim. `palvelut.html`.
2. Kopioi perusrakenne tiedostosta `tarinamme.html` (header, navigaatio, footer).
3. Varmista, että sivulla on Supabase SDK ja `main.js`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
   <script src="assets/js/main.js" defer></script>
   ```
4. Merkitse dynaamiset tekstit `data-cms="Kentän Nimi"` -attribuuteilla.
5. Lisää sivu `admin/pages.html`-taulukkoon.
6. Lisää sivu tiedostoon `sitemap.xml`.
7. Commit ja Push:
   ```bash
   git add palvelut.html admin/pages.html sitemap.xml
   git commit -m "feat: lisätty palvelut-sivu dynaamisella CMS-tuella"
   git push origin main
   ```

### 12.4. Admin-navigaation Päivitys
Jos lisäät uusia sivuja ylläpitoon, aja projektin juuressa:
```bash
node update_nav.js
```
Tämä skripti päivittää `admin-nav`-palkin automaattisesti kaikkiin `admin/*.html`-tiedostoihin!

---

## 13. MCP (MODEL CONTEXT PROTOCOL) JA TYÖKALUKONFIGURAATIO

Kun yhdistät Clauden (Claude Code CLI, Claude Desktop tai Anthropic Console) suoraan järjestelmään, käytä seuraavia MCP-palvelimia ja konfiguraatiota:

### Esimerkki: `claude_desktop_config.json` tai vastaava MCP-konfiguraatio:
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<HENKILÖKOHTAINEN_GITHUB_TOKEN>"
      }
    },
    "supabase": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://postgres:[SALASANA]@db.xbeonksexpjvekqjxoph.supabase.co:5432/postgres"
      }
    }
  }
}
```

---

## 14. VIANETSINTÄ JA HÄTÄTILANNEOHJEET (TROUBLESHOOTING)

| Oire | Todennäköinen syy | Ratkaisu Claudelle |
| :--- | :--- | :--- |
| **Sivustolla näkyy vanha sisältö git pushin jälkeen** | GitHub Pages CDN tai selaimen välimuisti viivästyttää päivitystä; tai `sessionStorage: cms_{slug}` on vanhentunut. | 1. Kokeile incognito-tilassa.<br>2. Tyhjennä selaimen `sessionStorage`.<br>3. Tarkista GitHub Actions / Pages deployment -tila GitHubista. |
| **Puhdas URL `/kohteet/slug` heittää 404-virheen** | `404.html`-tiedosto puuttuu tai sen reititysskripti on rikkoutunut. | Palauta luvun 4 mukainen `404.html`-koodi. Varmista, että tiedosto on suoraan repositorion juuressa. |
| **Lomakkeen lähetys epäonnistuu** | 1. Web3Forms rate-limit tai virheellinen avain.<br>2. Supabase RLS estää anonyymin INSERT-kutsun. | 1. Tarkista selaimen konsolista virhekoodi.<br>2. Aja luvun 6.1 mukainen RLS SQL: `CREATE POLICY "Public insert leads" ON public.leads FOR INSERT TO public WITH CHECK (true);`. |
| **Admin-kirjautuminen jumahtaa MFA-koodiin** | Käyttäjän TOTP-koodi ei synkronoidu tai tekijä on viallinen. | Supabasen taustalta voidaan ajaa SQL: `DELETE FROM auth.mfa_factors WHERE user_id = '...';` jolloin kirjautuminen pyytää uuden QR-koodin rekisteröintiä. |
| **Kuvat eivät näy tai upload epäonnistuu** | Supabase Storage `images`-bucket ei ole julkinen tai RLS estää latauksen. | Aja luvun 6.2 mukaiset Storage RLS -säännöt ja varmista, että bucketin asetus on `public: true`. |

---
*Tämä käsikirja on laadittu varmistamaan saumaton, turvallinen ja itsenäinen järjestelmänhallinta. Pidä tämä dokumentti ajan tasalla aina kun arkkitehtuuriin tai tietokantaan tehdään merkittäviä muutoksia.*
