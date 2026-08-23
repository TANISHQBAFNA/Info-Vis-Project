# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **static** COVID-19 / Social Vulnerability Index (SVI) data
visualization website (D3.js), deployed via Firebase Hosting. All site files live
in `public/`. There is **no build step, no test suite, and no lint config** —
development is: edit files in `public/`, then reload the browser.

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
  Serves at `http://127.0.0.1:5000`. A `--project` value is required; any
  `demo-*` id works and keeps the emulator fully offline (no login needed).

- Zero-dependency fallback (always works, even if `firebase-tools` is missing):
  ```
  python3 -m http.server 8080 --directory public
  ```
  Serves at `http://127.0.0.1:8080`.

Prefer running the server in a long-lived tmux session so logs stay visible.

### Notes / gotchas

- The page pulls D3, fonts, and the Firebase Analytics SDK from public CDNs at
  runtime, so the charts only fully render with outbound internet access. Egress
  is unrestricted in this environment.
- Core interactive flow to smoke-test: click a bar in the circular Social
  Vulnerability Index chart. The selected county highlights, the **About this
  {county}** panel on the right updates (and scrolls inside that card), and the
  radar / sunburst charts refresh.
- Deploying (`firebase deploy`) targets the real `infoviz-cs5764` site and
  requires Firebase auth; do not deploy as part of routine development.
