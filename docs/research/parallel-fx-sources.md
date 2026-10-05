# Parallel vs official FX rate sources

Research note for the "two prices" idea: for SYP, DZD, YER, IQD, LYD show both a
**central-bank / official rate** and a **parallel (market) rate**.

All endpoints below were fetched on **2026-10-05** unless noted. `[verified]` means the
value was read directly by the author of this note during this session; anything else is
reported by a research pass and still needs a smoke test from the deploy environment.

## Why the current feed is not enough

Frankfurter (the reference feed, ADR-0010) is **not a single central bank**. With
`?expand=providers` it is a blend of ~100 official/reference sources:

| Code | Frankfurter blend | Notable providers                                         | Central bank actually present?        |
| ---- | ----------------- | --------------------------------------------------------- | ------------------------------------- |
| SYP  | 122.24            | BDI, CBKKW, CBO, CBU, LB, NBP                             | no                                    |
| IQD  | 1312.07           | **CBI** (Central Bank of Iraq, indicative 1305), BNA, ... | yes, but 6 days old                   |
| DZD  | 133.97            | BAM, BCT, BDI, BOTA, IMF, NBP, NBU                        | **no** (Bank of Algeria absent)       |
| LYD  | 6.4217            | BCT, BDI, CBKKW, CBU, LB, NBP                             | **no** (Central Bank of Libya absent) |
| YER  | 236.87            | BDI, CBKKW, CBO, CBU, LB, NBP                             | no                                    |

So Frankfurter is a usable _reference_ number, but for these five it is not authoritative,
and it carries no parallel value at all.

## Summary

| Currency | Official (verified value)                                                          | Parallel (verified value)                                          | Automatable?                                                  |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| SYP      | `cb.gov.sy` **122.00** `[verified]`                                                | `sp-today.com` damascus **138.00** `[verified]`                    | official: scrape with browser UA; market: already integrated  |
| IQD      | `cbi.iq` **1310** (agent)                                                          | `iraqprices.com/api/prices` **1596.5** `[verified]`                | **yes** — clean JSON, one call returns both                   |
| DZD      | `squarealgerie.com/api/rates/official` **133.37** `[verified]`                     | `squarealgerie.com/api/rates` **238 / 242** `[verified]`           | **yes** — clean JSON                                          |
| LYD      | `cbl.gov.ly/en/currency-exchange-rates/` **6.4136 / 6.4297 / 6.4457** `[verified]` | weak: `fulus.ly` (paid) or `etcurrency.com` (HTML, low confidence) | official: scrape; parallel: source quality is the blocker     |
| YER      | reference **236.4** (Frankfurter blend; real CBY unreachable)                      | Sanaa **531–533**, Aden **1563–1576** (agent + YETI)               | parallel: candidate HTML/CSV, but licenses/access need review |

## Per currency

### SYP — Syrian Pound

- **Official:** `https://cb.gov.sy/` — server-rendered PHP HTML. USD read from the
  converter `<option value='122.00' >USD`. `[verified via curl, browser UA]`
  `webfetch` fails on this host (TLS/client quirk) but `curl` returns 200. No JSON API.
  Historical list at `index.php?page=list&...&act=779` (date | value | PDF).
  **Blocker (2026-10-05):** the host sends an incomplete TLS chain, so a Node/undici fetch
  fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (curl masks this by pulling the intermediate
  from the OS store via AIA). We will not disable certificate verification on a
  trust-sensitive page, so phase 1 drops the direct CBS scrape and SYP's official value
  falls back to the reference feed (~122.2, within ~0.2% of CBS's 122.0). Revisit if the
  bank fixes its chain, or pin the intermediate certificate.
- **Market:** `https://sp-today.com` — the existing scraper path is confirmed:
  RSC flight payload -> `"rates":[` -> `code:"USD"` -> `cities.damascus.buy` = 13800 ->
  /100 = 138.00. `[verified shape]`
- **sp-today has no official/bank field** (top-level `data` keys are only
  `cities`, `rates`, `gold`). It sells a key-gated API (`api-v2.sp-today.com`, 401).
- **Gap:** official 122.00 vs market 138.00 (~13%), consistent with the Sept-2026
  reporting on divergence.

### IQD — Iraqi Dinar

- **Official:** `https://cbi.iq/` homepage widget shows **USD 1310.000** (server-rendered
  HTML, no JSON). `https://cbi.iq/page/144` links XLSX files, but the filenames are
  upload-ID based and change on re-upload, so they must be re-scraped each time.
- **Parallel:** `https://iraqprices.com/api/prices` `[verified]` returns:
  `{"dollar":{"official":1310,"parallel":1596.5,"source":"t.me/iqborsa"},"health":{...}}`
  Free, keyless, hourly, includes its own `stale`/`ageHours`. Also documented at
  `https://iraqprices.com/llms.txt`.
- Alternative: `iraqsm.com/fx` has a documented free-key API (`/api/v1/fx`, 500 req/day).

### DZD — Algerian Dinar

- **Official:** `https://squarealgerie.com/api/rates/official` `[verified]` returns
  USD `buy 133.37 / sell 133.37`, labelled "Banque d'Algérie". Free, keyless, CORS `*`,
  60 req/min. The authoritative Bank of Algeria
  (`bank-of-algeria.dz/taux-de-change-journalier/`) was **not reachable** from the
  research environment (geoblock/TLS) — treat squarealgerie as a proxy and cross-check.
- **Parallel:** `https://squarealgerie.com/api/rates` `[verified]` returns
  USD `buy 238 / sell 242` (also EUR, GBP, USDT...). Same provider, free, keyless.
- Caveat: `etcurrency.com` reports ~251 and carries a different methodology — the two
  parallel publishers disagree by ~5%. Single community operator, unversioned.

### LYD — Libyan Dinar

- **Official:** `https://cbl.gov.ly/en/currency-exchange-rates/` `[verified via curl]` —
  USD buy **6.4136** / average **6.4297** / sell **6.4457**. Server-rendered HTML,
  no JSON API. Confirms Frankfurter's 6.42 is effectively the official rate after the
  Jan-2026 devaluation to ~6.3759.
- **Parallel:** the weak spot.
  - `https://fulus.ly/` — purpose-built Libyan parallel API, but **paid and auth-gated**
    (401 without token); homepage renders today's rates as base64 images.
  - `https://etcurrency.com/usd-to-lyd-black-market` — HTML, USD ~9.77/10.50, but
    self-reported confidence 64% and opaque methodology.
  - `libyaobserver.ly/exchange-rates` — **stale by ~8 months**, unusable.

### YER — Yemeni Rial

- **Official/reference:** Frankfurter blend **236.87** `[verified]`; foreign central
  banks (CBO 236.38, CBKKW 236.43, CBU 236.40) agree. The Yemeni central bank's own
  site (`centralbank.gov.ye`, `cby.gov.ye`) was unreachable, so which CBY branch this
  represents is unconfirmed.
- **Parallel:** not one market — **Sanaa (old notes)** vs **Aden (new notes)**, a ~3x gap.
  - `https://yemen.yeti.acaps.org/api/telegram_exchange_rates/?format=csv` (ACAPS/YETI):
    CSV `buy/currency/datetime/location/sell`; latest `us_dollar,sanaa` 531/533 and
    `us_dollar,aden` 1571/1576. **License is CC BY-NC-ND 4.0** — likely incompatible
    with a public/commercial site; verify before use.
  - `https://naqdilive.com/currencies/sanaa` and `/aden` — server-rendered HTML, values
    match YETI. Needs the exact selector confirmed.
  - `https://yemenrates.com/api-docs` — documents a free keyless Supabase JSON API
    (`/latest?city=sanaa|aden&currency=usd`), but the host was unreachable during
    research; smoke-test from production.
  - Several Arabic news mirrors (`yementdy.com`, `khbr.me`, `alnkkar.com`) share one
    template and were **~4.5 months stale**. `sarfrates.com` reports a Sanaa figure (600)
    that contradicts every other source.

## Licensing / reliability flags

- **ACAPS/YETI (YER):** CC BY-NC-ND — non-commercial, no derivatives. Blocker.
- **fulus.ly (LYD):** paid/auth product.
- **iraqsm.com:** free but keyed and "not for resale".
- **sp-today.com:** actively sells its API; scraping is tolerated today but unversioned.
- **squarealgerie.com:** single community operator, unversioned, but clean JSON.
- **cb.gov.sy / cbl.gov.ly / cbi.iq:** official but fragile PHP/HTML with no JSON.

## Recommendation

- **Ready now (clean JSON, keyless):** DZD (both rates) via squarealgerie.com, and IQD
  parallel via iraqprices.com.
- **Scrape, official only:** SYP official via cb.gov.sy, LYD official via cbl.gov.ly,
  IQD official via cbi.iq (or reuse IQD official from iraqprices' payload).
- **Needs a decision:** LYD parallel (paid vs low-confidence free) and YER parallel
  (license + Sanaa/Aden split). These two should not ship until a source is accepted.
- All providers must sit behind the existing provider seam and fall back to the
  reference value with a Sentry alert, exactly as the SYP market provider does (ADR-0012).
