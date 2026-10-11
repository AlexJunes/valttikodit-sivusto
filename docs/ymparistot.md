# Ympäristöt: tuotanto ja paikallinen testi

| Ympäristö | Osoite | Koodi | Tietokanta |
|---|---|---|---|
| **Tuotanto** | https://www.valttikodit.fi | `main`-haara (GitHub Pages) | Supabase-pilviprojekti (tuotanto) |
| **Paikallinen testi** | http://localhost:8099 | Mikä tahansa haara Macillasi | **Paikallinen Supabase (Docker)**, erillinen ja turvallinen |

Koodi valitsee tietokannan osoitteen mukaan (`IS_LOCAL_ENV` tiedostoissa `main.js`, `admin.js`, `analytics-dashboard.js`): `localhost` ja `127.0.0.1` käyttävät paikallista, kaikki muu tuotantoa. Jos paikallinen Supabase ei ole käynnissä, localhost **ei putoa tuotantoon**; data vain ei lataudu. Sivun vasemmassa alakulmassa näkyy ruskea "LOCAL – testitietokanta" -merkki. Localhostista **ei lähde oikeita sähköposteja** (Web3Forms-kutsu korvataan onnistuneella vastauksella).

Pilviagentit (`docs/agentit.md`) lukevat tuotantoa, eivät testiympäristöä.

## Käynnistys (kertaluonteinen asennus: Docker Desktop + `brew install supabase/tap/supabase`)

```bash
export PATH="$HOME/.docker/bin:$PATH"            # jos docker ei löydy
cd ~/Claude/valttikodit-sivusto
supabase start -x edge-runtime,logflare,vector,imgproxy,realtime,supavisor
python3 scripts/local_setup.py                   # luo taulut, säännöt, testidatan ja testiylläpitäjän
python3 scripts/dev_server.py 8099                # avaa http://localhost:8099 (toimii kuten GitHub Pages)
```

Pysäytys: `supabase stop`. Tyhjennys ja uudelleenluonti: aja `python3 scripts/local_setup.py` uudelleen (tyhjentää testidatan).

## Mitä testitietokannassa on
- Rakenne = tuotannon todellinen rakenne (`supabase/local/schema.sql`, tarkistettu 11.10.2026) + samat oikeussäännöt kuin tuotannossa (migraatiot `supabase/migrations/`).
- Esimerkkireferenssi (Sudenkorento 6 A ja B) migraatioista `2026-10-11_*.sql`.
- Kopio tuotannon **julkisesta** sisällöstä: julkaistut kohteet ja sivutekstit. Kuvat luetaan tuotannon Storagesta (vain luku).
- **Keksityt** testiliidit ja -katselut. Asiakkaiden oikeita liidejä ei koskaan kopioida.
- Testiylläpitäjä `admin@valttikodit.test`. Salasana: `~/Claude/valttikodit-salaiset/local_admin.txt` (repon ulkopuolella). Ensimmäisellä kirjautumisella (http://localhost:8099/admin/login.html) pyydetään kaksivaiheisen tunnistautumisen rekisteröinti: skannaa QR-koodi omalla Authenticator-sovelluksella.

## Työkalut
- Studio (tietokannan selain): http://127.0.0.1:54323
- Sähköpostit (Mailpit): http://127.0.0.1:54324
- API: http://127.0.0.1:54321

## Työnkulku tietokantamuutoksille
1. Kirjoita migraatio `supabase/migrations/PÄIVÄ_nimi.sql`.
2. Aja se ensin paikalliseen testitietokantaan (`docker exec -i supabase_db_valttikodit-local psql -U postgres -d postgres < tiedosto.sql`) ja testaa localhostissa.
3. Vasta sen jälkeen tuotantoon (varmuuskopio, SQL Editor, testaus). Päivitä `docs/tietokanta.md`.
4. Jos muutos vaikuttaa rakenteeseen, päivitä myös `supabase/local/schema.sql`.

## Rajoitukset
- Paikallinen ympäristö toimii vain Macilla (ei puhelimesta eikä pilvisessiosta).
- Kuvat ja tiedostot, jotka ladataan testiylläpidossa, menevät paikalliseen Storageen.
- Paikallisen Postgresin versio (17) voi poiketa tuotannosta.
- Julkinen esikatseluosoite jokaiselle PR:lle puuttuu (mahdollinen jatkokehitys: Cloudflare Pages).
