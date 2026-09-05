# Info-Vis-Project

CS5764 Information Visualization — Virginia counties and Mumbai wards housing indices.

The site is static Firebase Hosting (`public/`). The homepage fetches **live** Zillow Research county CSVs and Census Reporter ACS in the browser, plus Open-Meteo weather/AQI for Mumbai wards. Yearly overlays that have no small CORS API (HUD FMR, Redfin $/ft², IGR ready reckoner) stay as tiny committed files.

Open `public/index.html` (or the Firebase Hosting emulator on port 5000).

## Live vs overlay

| Layer | Source | How it updates |
|---|---|---|
| VA typical home, rent, inventory, listings, price cuts, days-to-pending, market heat | Zillow public CSVs | Browser `fetch`, Cache API ~12h |
| VA ACS rent, value, vacancy, tenure, rent burden | Census Reporter | Browser `fetch`, ~24h cache |
| Mumbai AQI, PM, temp, rain | Open-Meteo | Browser `fetch`, 15 min session cache |
| VA closed-sale $/ft² | Redfin county tracker | Overlay only (~230 MB, not fetched) |
| VA HUD 2BR FMR | HUD FY2026 schedule | Annual JSON overlay |
| Mumbai ₹/ft² | IGR ASR / ready reckoner | Annual ward snapshot (no JSON API) |

No API keys in client JS. Do not scrape listing portals.

Project files: `public/index.html`, `public/assets/css/style.css`, `public/assets/js/housing.js`, `housing-live.js`, `housing-maps.js`.

Github: https://github.com/TANISHQBAFNA/Info-Vis-Project

Live site: https://infoviz-cs5764.web.app/
