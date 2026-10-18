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
