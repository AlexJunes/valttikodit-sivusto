# Automaatio ja agentit

Ajastetut pilviagentit (Claude Code routines, Anthropicin pilvessä). Hallinta: https://claude.ai/code/routines. Kaikki agentit ovat **vain lukevia**: ne eivät muokkaa koodia, tietokantaa eivätkä lähetä lomakkeita. Ne raportoivat ajon tuloksena ja push-ilmoituksena puhelimeen.

> Päivitä tämä taulukko aina kun agentteja lisätään, poistetaan tai niiden aikataulu/ohje muuttuu.

| Agentti | Aikataulu (Suomen aikaa) | Routine-ID | Tehtävä |
|---|---|---|---|
| Päivittäinen terveystarkastus | päivittäin 08:00 (kesäaika) | `trig_01EPgNt4XpcJUYBTG4MURwHd` | HTTP-tilat ja vastausajat (myös Referenssit ja Myy tonttisi), www-ohjaukset, Supabase-yhteys, kohdesivujen reititys, julkaistut referenssit ja niiden kuvat (taulu `reference_cases`), linkit/kuvat, `404.html`, sitemapin täsmäys (kohteet ja referenssit), CSS/JS-versiotunnisteet. **SSL-voimassaoloa ei voi mitata pilviympäristöstä** (egress-välityspalvelin korvaa sertifikaatin); tarkista Macilta: `echo | openssl s_client -connect www.valttikodit.fi:443 -servername www.valttikodit.fi 2>/dev/null | openssl x509 -noout -enddate` |
| Viikkoraportti | maanantaisin 08:00 | `trig_01PYb8grwdoUCFKzxfAVcGFa` | Katselut, liidit, top-sivut, laitteet, viittaajat, kohteiden tilat (funktio `report_weekly`), kehitysehdotukset |
| Kuukausittainen SEO- ja sisältötarkastus | kuun 1. päivä 08:00 | `trig_01RkenKnKZKfMqsKeF61jB4e` | Metatiedot, kuvat, schema, sitemap, nopeus, saavutettavuus, kohteiden sisältö |

Cron on UTC-ajassa (`0 5 * * *` = 08:00 kesäaikaa, 07:00 talviaikaa).

## Ympäristö
- Kaikki käyttävät samaa pilviympäristöä (id `env_017GzjBuFT6quEykLdchbZ9B`), jossa on **täysi verkkoyhteys** ja ympäristömuuttuja `REPORT_TOKEN` (vain viikkoraportti käyttää).
- Liittimiä (connectors) ei ole liitetty. Jos ne ilmestyvät rutiinille automaattisesti, poista ne (rutiinin muokkaus tai `clear_mcp_connections`).
- Ympäristömuuttujat näkyvät kaikille ympäristön käyttäjille: älä laita sinne mitään arkaluonteisempaa kuin aggregaattifunktion avain.

## Ohjaus puhelimesta
Remote Control: tämän repon Code-istunto näkyy Claude-puhelinsovelluksessa (Code-välilehti). Mac pitää olla päällä ja hereillä.

## Turvasäännöt agenteille
- Ei kirjoitusta tuotantotietokantaan; ei lomakkeiden lähetystä; ei henkilötietojen hakemista tai raportointia.
- `main`-haara on suojattu (ruleset): muutokset vain PR:n kautta, merge tekee käyttäjä.
- Kaikki muutosehdotukset tulevat PR:inä tai raportissa, ei suoraan tuotantoon.

## Kehityskäytäntö
Uusi osio tai muutos: Claude tekee haaran, testaa paikallisesti (`python3 scripts/dev_server.py`), avaa PR:n. Julkaisu tapahtuu vasta kun käyttäjä mergeää. Katso `CLAUDE.md`.

## Päivittäinen analyysi- ja liidiraportti

Routine `trig_01KrSNbdov1gXyVV5ruHRf7w` ("valttikodit.fi – päivittäinen analyysi- ja liidiraportti"), joka päivä klo 06:00 UTC (08/09 Suomen aikaa). Hakee Supabasen funktiolla `report_daily(p_token)` (migraatio `2026-10-17_report_daily.sql`, sama `REPORT_TOKEN` kuin viikkoraportissa) vain aggregaatit: 14 päivän sarja (katselut, sessiot, liidit), eilisen sivut/laitteet, viittaajat, liidit lähteittäin (jäsennetään viestin `LÄHDE:`-rivistä), käsittelemättömät liidit ja niiden ikä, kohteiden tilat. Ei henkilötietoja. Raportti on Jani-tasoinen yhteenveto: tila (OK/HUOMIO/KRIITTINEN), uudet liidit, liikenne ja konversio (suuntaa-antava), sivut ja kanavat sekä 2–3 toimenpide-ehdotusta. Toimitus: raportti näkyy ajon lokissa claude.ai:ssa ja push-ilmoitus tiivistelmästä; sähköpostitoimitus vaatii erillisen sähköpostipalvelun (ks. liidiagenttisuunnitelma). Tilastoharha: sessiot lasketaan vain evästeet hyväksyneistä.
