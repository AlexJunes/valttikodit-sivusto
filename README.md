# Valttikodit.fi

Valttikotien verkkosivusto: staattinen HTML/CSS/Vanilla JS (ei build-vaihetta), Supabase (tietokanta, kirjautuminen, kuvat) ja GitHub Pages (julkaisu `main`-haarasta, domain `www.valttikodit.fi`).

## Dokumentaatio
- `CLAUDE.md` – säännöt ja työnkulku (Claude Code lukee tämän)
- `docs/TILA.md` – **automaattisesti generoitu** tuotantotila (sivut, CMS-kentät, taulut, riippuvuudet)
- `docs/arkkitehtuuri.md`, `docs/tietokanta.md`, `docs/tietoturva.md`, `docs/agentit.md` – selitykset
- `supabase/migrations/` – tietokantamuutokset (ajetaan käsin Supabasessa)

## Paikallinen kehitys
```bash
python3 scripts/dev_server.py 8080   # avaa http://localhost:8080 (puhtaat URLit kuten GitHub Pagesissa)
python3 scripts/update_docs.py  # päivitä docs/TILA.md
```
