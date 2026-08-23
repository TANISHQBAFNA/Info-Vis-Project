# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **static** COVID-19 / Social Vulnerability Index (SVI) data
visualization website (D3.js + Bootstrap), deployed via Firebase Hosting. All
site files live in `public/`. There is **no build step, no test suite, and no
lint config** — development is: edit files in `public/`, then reload the browser.

### Running the app (dev)

The project is a Firebase Hosting site (see `firebase.json`, which serves the
`public/` directory). The startup update script installs `firebase-tools` to a
user-local npm prefix (`~/.npm-global`).

- Firebase Hosting emulator (matches deployment semantics):
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

- The page pulls D3, AOS, Bootstrap fonts, and the Firebase Analytics SDK from
  public CDNs at runtime, so the charts only fully render with outbound internet
  access. Egress is unrestricted in this environment.
- Core interactive flow to smoke-test: scroll to the **"Select County"** section
  and click a bar in the circular chart — the clicked bar turns cyan, the county
  info panel populates, and a 5-axis radar chart renders on the right.
- Deploying (`firebase deploy`) targets the real `infoviz-cs5764` site and
  requires Firebase auth; do not deploy as part of routine development.
