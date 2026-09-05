# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **static** housing-index visualization (D3.js) for Virginia
counties and Mumbai BMC wards, deployed via Firebase Hosting. All site files
live in `public/`. There is **no build step, no test suite, and no lint config**
— development is: edit files in `public/`, then reload the browser.

The Cloud Agent environment installs `firebase-tools` to a user-local npm prefix
(`~/.npm-global`) and starts the Firebase Hosting emulator on port 5000.

### Running the app (dev)

The project is a Firebase Hosting site (see `firebase.json`, which serves the
`public/` directory).

- Firebase Hosting emulator (matches deployment semantics; started automatically
  in Cloud Agents):
  ```
  ~/.npm-global/bin/firebase emulators:start --only hosting --project demo-infoviz
  ```
  Serves at `http://127.0.0.1:5000` **on the Cloud Agent machine**. A `--project`
  value is required; any `demo-*` id works and keeps the emulator fully offline
  (no login needed). From your laptop, open this agent in the Agents Window,
  click the plug icon (top right), and open the forwarded port 5000. Typing
  `127.0.0.1:5000` in a normal browser tab hits your laptop, not this VM, unless
  that forward is active.

- Zero-dependency fallback (always works, even if `firebase-tools` is missing):
  ```
  python3 -m http.server 8080 --directory public
  ```
  Serves at `http://127.0.0.1:8080`.

Prefer running the server in a long-lived tmux session so logs stay visible.

### Notes / gotchas

- The page pulls D3, fonts, Zillow CSVs, Census Reporter, and Open-Meteo from
  public CDNs/APIs at runtime, so maps only fully render with outbound internet.
  Egress is unrestricted in this environment.
- Core interactive flow to smoke-test: homepage loads Virginia ZHVI choropleth
  from live Zillow. Click a county — About panel fills with price, market, rent,
  ACS stats and 24-month sparklines. Toggle Mumbai — ASR map plus live AQI/weather.
  Metric chips with a green dot are live fetches; HUD FMR and $/ft² are yearly
  overlays.
- Do not put API keys in `public/`. Do not fetch the ~230 MB Redfin county file
  in the browser. Do not scrape listing portals.
- Deploying (`firebase deploy`) targets the real `infoviz-cs5764` site and
  requires Firebase auth; do not deploy as part of routine development.
