# Tietokanta (Supabase) – selitys

Projekti: `xbeonksexpjvekqjxoph`. Taulujen ja koodin käyttötavat luetellaan automaattisesti tiedostossa `TILA.md`. Tämä tiedosto kertoo, **miksi** ja **millä säännöillä**.

> **Totuus tuotannosta:** `supabase/schema.sql` on käsikirjan tavoiteskeema (referenssi), ei tuotannon täsmällinen kopio. Tuotannon muutokset kirjataan `supabase/migrations/`-tiedostoina, ja ne ajetaan käsin Supabase SQL Editorissa. Päivitä tämä tiedosto aina kun lisäät migraation.

## Sivuston taulut

| Taulu | Käyttö |
|---|---|
| `projects` | Kohteet. Julkinen näkee vain `published = true`. Tilat: MARKETING, AVAILABLE, CONSTRUCTION, RESERVED, SOLD. |
| `pages` | CMS-sisältö (`slug`, `content` JSONB). Etusivu, tarinamme (slug `valtti-tapa`), yhteys jne. |
| `leads` | Yhteydenotot (nimi, sähköposti, puhelin, viesti, tila UUSI/KÄSITELTY). **Henkilötietoja.** |
| `page_views` | Oma analytiikka (polku, laite, viittaaja, anonyymi sessio). |
| `admin_users` | Ylläpitäjät. Sähköposti tässä taulussa = ylläpito-oikeus (`is_site_admin()`). |
| `reference_cases` | Referenssitarinat (migraatio `2026-10-11_reference_cases.sql`). Sama sivupohja kaikille; sisältö (tekstit, tunnusluvut, galleria, ratkaisut, tiedot) JSONB-kenttinä. Julkinen näkee vain `published = true`; ylläpito hallitsee (`is_site_admin()`). Kuvat Storage-bucketissa `images` polussa `references/<slug>/`. |
| `report_tokens` | Viikkoraportin avaimen tiiviste (yksi rivi, ei näy suoraan kenellekään). |

**Toisen sovelluksen taulut samassa projektissa** (ei kuulu tähän sivustoon, älä koske): `contractors`, `labor_logs`, `project_billing`, `project_costs`, `project_files`, `project_phases`, `safety_inspections`, `site_diaries`, `tasks`.

## Oikeudet (RLS) – voimassa 10.10.2026 jälkeen

Migraatio: `supabase/migrations/2026-10-10_secure_rls.sql`.

- **Ylläpito** = kirjautunut käyttäjä, jonka sähköposti on `admin_users`-taulussa. Funktio `public.is_site_admin()`. Ylläpito saa tehdä kaiken tauluille `leads`, `projects`, `pages`, `page_views`, `admin_users` ja hallita Storage-bucket `images`:ia.
- **Julkinen (anon):**
  - lukea julkaistut `projects`-rivit ja koko `pages`
  - lisätä `leads`-rivin (rajoitukset: status = 'UUSI', nimi 1–200 merkkiä, sähköposti 3–254 ja sisältää @, puhelin ≤ 50, viesti ≤ 5000)
  - lisätä `page_views`-rivin (polku 1–500 merkkiä)
  - lukea Storage-bucket `images` (kuvat)
- **Kiellettyä:** julkisia SELECT/UPDATE/DELETE-käytäntöjä tauluihin `leads`, `page_views`, `admin_users`, eikä julkisia kirjoituskäytäntöjä tauluihin `projects`, `pages` tai Storageen. Älä koskaan lisää sellaisia.
- Supabase Auth: **rekisteröityminen on pois päältä** (Authentication → Sign In / Providers). Uudet ylläpitäjät kutsutaan Supabase Authin kautta ja lisätään `admin_users`-tauluun.

Tunnettu rajoitus: MFA (`aal2`) vaaditaan vain selaimessa, ei RLS:ssä.

## Referenssit (reference_cases)

Migraatio: `supabase/migrations/2026-10-11_reference_cases.sql`; esimerkkiaineisto (Sudenkorento 6 A ja B): `2026-10-11_seed_sudenkorento.sql` (kuvapolut ovat repon suhteellisia polkuja `assets/img/referenssit/...`). Tuotantoon: aja ensin taulumigraatio, sitten halutessasi seed. Referenssejä lisätään ylläpidosta (`admin/references.html`); kuvat pienennetään selaimessa (max 2000/1800 px, JPEG) ennen Storage-latausta. Julkaisematon referenssi näkyy esikatseluna vain kirjautuneelle ylläpitäjälle.

## Viikkoraportin funktio

Migraatio: `supabase/migrations/2026-10-10_report_weekly.sql`. Funktio `public.report_weekly(p_token text)` palauttaa vain yhteenvetolukuja (katselut, sessiot, liidien määrät, kohteiden tilat), ei henkilötietoja. Avain on ympäristömuuttujana `REPORT_TOKEN` pilviagentin ympäristössä; Supabasessa on vain sen tiiviste. Avaimen vaihto: aja migraatio uudelleen uudella avaimella ja päivitä ympäristömuuttuja.

## Muutosprosessi

1. Claude kirjoittaa migraation tiedostoksi `supabase/migrations/PÄIVÄ_nimi.sql` haarassa ja PR:ään.
2. Käyttäjä tarkistaa SQL:n, tekee varmuuskopion ja ajaa sen Supabase SQL Editorissa.
3. Testaus (ylläpito + julkinen sivusto), sitten PR mergataan.
4. Päivitä tämä tiedosto ja aja `python3 scripts/update_docs.py`.

## Raportointifunktiot

`report_weekly(p_token)` (2026-10-10) ja `report_daily(p_token)` (2026-10-17): SECURITY DEFINER, palauttavat vain aggregaatteja ja vaativat avaimen (`report_tokens`, tiiviste; sama avain molemmille). Päivät lasketaan ajassa Europe/Helsinki. `report_daily` jäsentää liidin lähteen viestin ensimmäiseltä riviltä `LÄHDE: …` (vain lukumäärät lähteittäin).

## Liidiagentti (agent_get_leads, agent_mark_lead, notify_new_lead)

Migraatio `2026-10-18_lead_agent.sql`: leads-tauluun sarakkeet `category`, `agent_status` (NULL / PROCESSING / DONE / FAILED / SKIPPED), `agent_claimed_at`, `agent_attempts`, `agent_processed_at`; nykyiset liidit merkitään SKIPPED. Funktiot (SECURITY DEFINER, oma avain `agent_tokens`, EI sama kuin raporttiavain, koska palauttavat henkilötietoja):
- `agent_get_leads(p_token, p_limit)` hakee ja varaa (PROCESSING) käsittelemättömät liidit, varaus vanhenee 30 min, enintään 3 yritystä.
- `agent_mark_lead(p_token, p_lead_id, p_category)` merkitsee liidin DONE ja tallentaa luokan (TALON_OSTAJA, TONTIN_MYYJA, ALIHANKKIJA, MUU, ROSKAPOSTI). Ei muuta kirjoitusta.
Migraatio `2026-10-18_lead_agent_trigger.sql`: pg_net-laukaisin `trg_notify_new_lead` lähettää uudesta liidistä pilviagentille (Claude routine, API-trigger) vain tekstin `lead_id=<uuid>`; URL ja avain Vaultissa (`lead_routine_url`, `lead_routine_token`); virheet nielaistaan, liidin tallennus ei koskaan epäonnistu.

## Some-hallinta (social_campaigns, social_posts, social_audit)

Migraatio `2026-11-14_social.sql`. RLS: vain ylläpito (`is_site_admin()`). Suojalaukaisin `social_posts_guard` estää selainta asettamasta tiloja SCHEDULED/PUBLISHED/FAILED tai kirjoittamasta Facebook-tunnisteita (vain julkaisupalvelu / service role saa), mitätöi hyväksynnän sisältömuutoksessa, estää ajastetun julkaisun muokkauksen ja ajastetun/julkaistun poiston. `social_posts_audit` kirjaa tapahtumat tauluun `social_audit` (vain luku ylläpidolle).

## Some-tulokset (social_fb_posts, social_post_metrics, social_page_metrics, social_sync_log)

Migraatio `2026-11-14_social_metrics.sql` (+ `2026-11-14_social_cron.sql` yöajolle). RLS: vain ylläpito lukee; kirjoittaa vain julkaisupalvelu (service role). Funktio `social_results(p_days)` (SECURITY DEFINER, vain `is_site_admin()`) palauttaa yhdistetyn näkymän, `social_cron_sync()` lukee osoitteen ja salaisuuden Vaultista (`social_function_url`, `social_cron_secret`) ja kutsuu pg_netillä Edge Functionia.

## Some-agentti (social_agent_tokens, social_posts.source/agent_note)

Migraatio `2026-11-14_social_agent.sql`. Taulu `social_agent_tokens` sisältää vain agentin avaimen tiivisteen (sha256), ei avainta. Funktiot `social_agent_context(p_token)` (tulokset, kampanjat, viimeaikaiset julkaisut luettavaksi) ja `social_agent_create_draft(...)` (luo vain luonnoksen; `source='agent'`, `created_by='agentti'`, perustelu `agent_note`) ovat SECURITY DEFINER ja avaimen tarkistavia. Rajat: enintään 5 agentin luonnosta viikossa, enintään 8 hyväksymätöntä agentin luonnosta, ajankohta 1 h – 29 vrk päässä, kuva https, linkki vain www.valttikodit.fi, kampanjatunnus `[a-z0-9-]{1,50}`. Suojalaukaisin estää selainta asettamasta `source='agent'`. Taulut eivät ole anon-käyttäjän luettavissa; vain nämä funktiot.

## Some: Reels-videot (social_posts.video_url)

Migraatio `2026-11-17_social_reels.sql`. Sarake `video_url` (vain https). Kun se on asetettu, julkaisu ajastetaan Reels-videona. Suojalaukaisin `social_posts_guard` käsittelee videon vaihdon sisältömuutoksena (mitätöi hyväksynnän, estetty ajastetulle julkaisulle).

## Some: Instagram (social_posts.channels, ig_*, social_ig_media)

Migraatio `2026-11-20_social_instagram.sql`. `channels` (facebook ja/tai instagram) valitaan julkaisukohtaisesti. Instagramin tila on omissa sarakkeissaan: `ig_status` (PENDING → PROCESSING → PUBLISHED / FAILED), `ig_container_id`, `ig_media_id`, `ig_permalink`, `ig_published_at`, `ig_error`; vain julkaisupalvelu kirjoittaa niitä (`social_posts_guard`). Julkaisun kokonaistila on PUBLISHED, kun kaikki valitut kanavat on julkaistu, ja FAILED, jos Instagram epäonnistui. Taulu `social_ig_media` sisältää Instagram-tilin julkaisujen luvut (näytöt, tavoitetut, tykkäykset, kommentit, tallennukset, jaot) ja `social_page_metrics.ig_followers` seuraajamäärän; `social_results` palauttaa ne (`ig_posts`). Ajastin `social-tick` (pg_cron, 10 min välein) kutsuu funktiota `social_cron_tick()`, joka kutsuu julkaisupalvelua vain, jos ajastettuja julkaisuja on erääntymässä.

Migraatio `2026-11-20_social_ig_text.sql`: `social_posts.ig_body` (valinnainen Instagram-teksti, enintään 2200 merkkiä; tyhjänä Instagramiin julkaistaan `body`). Muutos mitätöi hyväksynnän. Agentin `social_agent_create_draft` sai parametrit `p_channels` (oletus facebook) ja `p_ig_body`; Instagram vaatii kuvan.

## Some: markkinoinnin tavoitteet (social_goals)

Migraatio `2026-11-21_social_goals.sql`. Yksi rivi (id = 1): tärkeimmät kohteet (`focus_projects`, kohteiden slugit), perustelu, painotukset (`priorities`: myynti / tontit / seuraajat / luottamus, 0–3), viikon erityisviesti, vältettävät asiat ja voimassaolo (`valid_until`). RLS: vain ylläpito. Laukaisin `social_goals_stamp` asettaa päivittäjän ja ajan palvelimella ja kirjaa muutoksen `social_audit`-lokiin (`tavoitteet paivitetty`). Some-agentti saa tavoitteet `social_agent_context`-funktion kentässä `goals` vain, kun ne ovat voimassa.

## Analytiikka: lisädata (site_events, leads.outcome, Instagramin tililuvut)

Migraatio `2026-11-22_analytics_data.sql`.
- `site_events`: sivuston tapahtumat `cta_phone`, `cta_email`, `brochure` (PDF-linkki), `form_start` (lomakkeen ensimmäinen kenttä) ja `engagement` (näkyvissäoloaika `seconds` ja syvin vierityskohta `scroll_pct`, yksi rivi sivukatselua kohden). Julkinen saa vain lisätä (rajat CHECK-ehdossa, aika asetetaan palvelimella), ylläpito lukee. `session_id` vain, jos kävijä on sallinut analytiikan.
- `leads.outcome` (`KAUPPA` / `EI_KAUPPAA` / tyhjä = avoin), `outcome_at`, `outcome_by`: ylläpito merkitsee liidin tiedoissa; laukaisin `leads_outcome_guard` estää julkista lomaketta asettamasta lopputulosta ja tallentaa merkitsijän ja ajan.
- `social_page_metrics.ig_reach`, `ig_profile_views`, `ig_website_clicks`, `ig_accounts_engaged`: Instagramin tilitason päiväluvut (julkaisupalvelun `sync`, kolme päättynyttä päivää kerrallaan).

## Analytiikka: raporttifunktio

Migraatio `2026-11-22_analytics_report.sql`. `analytics_report(p_from date, p_to date)` (vain ylläpito, enintään 366 päivää) palauttaa valitun jakson (`cur`) ja edellisen samanpituisen jakson (`prev`) tunnusluvut (`analytics_period`), päiväsarjat (`daily`) sekä erittelyt: lähteet, laitteet, sivut (katselut, lukuaika, vieritys, yhteydenottoaikeet), liidien tyypit ja kanavat (kaupat mukana), kampanjat, Facebook- ja Instagram-julkaisut. Apufunktiot `analytics_source` (käynnin lähde) ja `analytics_path` (osoitteen yhtenäistys).
