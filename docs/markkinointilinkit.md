# Markkinointilinkit ja kampanjaseuranta (UTM)

Some-julkaisujen ja mainosten linkit merkitaan kampanjatunnisteilla, jotta nahdaan, mika julkaisu toi kavijoita ja liideja.

## Linkin rakenne

`https://www.valttikodit.fi/kohde.html?kohde=<slug>&utm_source=<kanava>&utm_medium=<tyyppi>&utm_campaign=<kampanja>`

- `utm_source`: `facebook` tai `instagram`
- `utm_medium`: `social` (orgaaninen julkaisu) tai `paid` (maksettu mainos)
- `utm_campaign`: lyhyt kuvaava nimi pienilla kirjaimilla ja viivoilla, esim. `saunaranta-b-lokakuu`
- `utm_content` (valinnainen): yksittainen julkaisu tai versio, esim. `kuvajulkaisu-1`

Esimerkki: `https://www.valttikodit.fi/kohde.html?kohde=saunaranta_b&utm_source=facebook&utm_medium=social&utm_campaign=saunaranta-b-lokakuu`

**Kayta kohteiden linkeissa muotoa `kohde.html?kohde=<slug>`, ei `/kohteet/<slug>`**: puhdas osoite kulkee 404-reitityksen kautta, joka pudottaa kyselyparametrit.
Muut sivut: `https://www.valttikodit.fi/myy-tonttisi.html?utm_...`, `/referenssit.html?utm_...`.

## Miten seuranta toimii

- `assets/js/main.js` lukee `utm_*`-parametrit kavijan saapuessa. Tunnisteet puhdistetaan (pienet kirjaimet, enintaan 60 merkkia).
- Sivukatseluun (`page_views`) tallentuu `utm_source/medium/campaign/content`. Evasteet hyvaksyneen kavijan ensimmainen tunniste muistetaan sessiossa (`sessionStorage`, `v_utm`), jolloin myos seuraavat sivut samassa vierailussa merkitaan samalle kampanjalle. Ilman evastesuostumusta tunniste tallentuu vain sille sivulle, jolle kavija saapui.
- Lomakkeen liidin viestiin lisataan rivi `Kampanja: <lahde> / <tyyppi> / <kampanja>`. Yllapidon liidi-ikkuna nayttaa sen omana rivinaan.
- `report_daily` palauttaa `campaign_views_yesterday`, `campaign_views_7d` ja `campaign_leads_28d`.
- Tietokanta: migraatio `supabase/migrations/2026-10-18_utm_tracking.sql`.
