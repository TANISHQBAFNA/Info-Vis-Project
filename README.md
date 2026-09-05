# Info-Vis-Project

CS5764 Information Visualization — Virginia counties and Mumbai wards housing indices.

The site is static Firebase Hosting (`public/`). The homepage fetches **live** Zillow Research county CSVs and Census Reporter ACS in the browser. Mumbai uses IGR ready-reckoner ₹/ft² plus Census 2011 housing stock. Yearly overlays with no small CORS API (HUD FMR, Redfin $/ft²) stay as tiny committed files. No weather layer.

Open `public/index.html` (or the Firebase Hosting emulator on port 5000).

## Live vs overlay

| Layer | Source | How it updates |
|---|---|---|
| VA typical home, rent, inventory, listings, price cuts, days-to-pending, market heat | Zillow public CSVs | Browser `fetch`, Cache API ~12h |
| VA ACS rent, value, vacancy, tenure, rent burden | Census Reporter | Browser `fetch`, ~24h cache |
| VA closed-sale $/ft² | Redfin county tracker | Overlay only (~230 MB, not fetched) |
| VA HUD 2BR FMR | HUD FY2026 schedule | Annual JSON overlay |
| Mumbai ₹/ft² and unit floors | IGR ASR / ready reckoner | Annual ward snapshot (no JSON API) |
| Mumbai households / population | Census 2011, aggregated to 24 BMC wards | Committed overlay |

No API keys in client JS. Do not scrape listing portals.

Github: https://github.com/TANISHQBAFNA/Info-Vis-Project

Live site: https://infoviz-cs5764.web.app/
