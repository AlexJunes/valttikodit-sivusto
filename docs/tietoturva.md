# Tietoturva – tarkastuslista

## Auditointi 10.10.2026 (tulokset)

Todellinen tuotannon tila poikkesi käsikirjasta: julkiset (anon) käytännöt sallivat leads-taulun lukemisen ja muokkauksen, projects- ja pages-taulujen täyden hallinnan sekä storage-bucket `images` hallinnan. Korjattu migraatiolla `supabase/migrations/2026-10-10_secure_rls.sql` (PR #4) ja ylläpidon XSS-korjauksella (PR #5).

**Nykytila:** ylläpito = kirjautunut käyttäjä, jonka sähköposti on `admin_users`-taulussa (`public.is_site_admin()`). Julkinen: lukee julkaistut kohteet ja `pages`, lisää liidin ja sivukatselun rajatuin kentin. Rekisteröityminen on kytketty pois (Supabase Auth). Tunnuksia 3, kaikilla MFA.

**Huom:** samassa Supabase-projektissa on toisen sovelluksen tauluja (contractors, labor_logs, project_billing, project_costs, project_files, project_phases, safety_inspections, site_diaries, tasks). Niihin ei saa koskea tämän sivuston muutoksissa. Niillä on "authenticated = täysi pääsy" -käytännöt.

**Jäljellä:** MFA (`aal2`) vaaditaan vain selaimessa, ei RLS:ssä; julkinen `main.js` renderöi CMS-sisällön HTML:nä (turvallinen niin kauan kuin vain ylläpito kirjoittaa); liidien aiempi julkinen luettavuus (GDPR-arvio, ei tarkistettu lokeista); spam-rajoitus lomakkeille (rate limit/Turnstile); ympäristömuuttuja REPORT_TOKEN pilviympäristössä (vain aggregaattifunktio).

## Alkuperäinen tarkastuslista (käsikirjan pohjalta, osin ratkaistu)

Tilanne: käsikirjan mukainen *tavoitetila*. Todellista tilaa Supabasessa ei ole vielä tarkistettu. Tarkista ennen muutoksia (Supabase → Authentication → Policies, Providers).

## Tarkistettavat kohdat (prioriteettijärjestyksessä)

1. **Rekisteröityminen.** Jos "Allow new users to sign up" on päällä Supabasessa, kuka tahansa voi luoda tunnuksen. Käsikirjan RLS-säännöt (`TO authenticated USING (true)`) antaisivat sille täyden pääsyn kohteisiin, sivuihin, liideihin ja analytiikkaan. → Sulje rekisteröityminen JA rajaa säännöt `admin_users`-listaan.
2. **`admin_users` ei ohjaa oikeuksia.** Taulu on olemassa, mutta säännöt eivät käytä sitä. Ehdotus: apufunktio `is_admin()` (esim. `exists(select 1 from admin_users where email = auth.jwt()->>'email')`), jota kaikki ylläpitosäännöt käyttävät.
3. **MFA vain selaimessa.** `aal2`-tarkistus `admin.js`:ssä ei suojaa dataa; REST-rajapintaa voi kutsua suoraan. Lisää RLS-ehto `(auth.jwt()->>'aal') = 'aal2'`.
4. **`projects`-luku:** käsikirjan sääntö sallii julkisen lukemisen vain julkaistuista; varmista ettei luonnoksia vuoda.
5. **Spam:** `leads` ja `page_views` sallivat anonyymin INSERTin ilman rajoja. Lisää CHECK-rajoitteet (kenttien pituudet, sähköpostin muoto) ja harkitse rate limitiä / Cloudflare Turnstile -suojausta lomakkeisiin.
6. **Storage:** vain admin saa ladata/poistaa kuvia; harkitse tiedostotyyppi- ja kokorajoitusta bucketille.
7. **`.env.local` on commitoitu** (vain julkisia avaimia). Poista versionhallinnasta ja lisää `.gitignore`en.
8. **Tietosuoja:** liidit ovat henkilötietoja; varmista säilytysaika ja että tietosuojaseloste vastaa käytäntöä. Älä pidä liidejä pidempään kuin tarpeen.

## Salaisuuksien käsittely

- Julkisia (saa olla selaimessa): Supabase URL + publishable/anon key, Web3Forms access key.
- Salaisia (ei koskaan repoon tai chattiin): Supabase `service_role` key, tietokannan salasana, GitHub-tokenit.
- Claudelle/agenteille: ei kirjoitusoikeutta tuotantotietokantaan. Raportointiin vain-luku-rooli rajatuilla tauluilla.

## Muutosprosessi

Jokainen tietokantamuutos: migraatiotiedosto `supabase/migrations/` → käyttäjän tarkistus → käyttäjä ajaa SQL Editorissa → commit.

## Some-hallinta ja Facebook-avain

- Facebook-sivun pysyvä avain (`META_PAGE_TOKEN`) ja `META_PAGE_ID` ovat vain Supabase Edge Functionin salaisuuksia (sekä tarvittaessa luku-agenttien ympäristössä); niitä ei ole selaimessa, tietokannassa eikä repossa.
- Julkaisupalvelu vaatii kirjautuneen ylläpitäjän ja MFA:n (aal2), tarkistaa `is_site_admin()` ja sallii vain ajastuksen, peruutuksen, luvun ja yhteystestin. Virheviesteistä poistetaan avain.
- Hyväksyntä, ajastus ja peruutus kirjataan tauluun `social_audit`. Agentit (esim. some-suunnittelija) eivät julkaise: ne tekevät vain luonnoksia.

### Some-yöajo ja funktion tunnistus

Funktio `social-publish` tunnistaa kutsujan itse: joko ylläpitäjän istunto + MFA (kaikki toiminnot) tai `x-cron-secret` (ainoastaan `sync`). Siksi funktion "Enforce JWT Verification" on pois päältä (pg_cron-kutsulla ei ole käyttäjän JWT:tä). Salaisuus `CRON_SECRET` on funktion salaisuus ja Vaultissa (`social_cron_secret`); sitä ei ole repossa. `sync` vain lukee Facebookia ja kirjoittaa tilastotauluihin.
