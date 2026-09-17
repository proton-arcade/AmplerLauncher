# Ampler Launcher — fully offline build

A Minecraft-themed launcher for Eaglercraft that runs with **no internet
connection at all**. Every byte it needs is inside this repository.

```
v2.0.00-offline
```

---

## Quick start

**Windows** — double-click `start-offline.bat`
**macOS** — double-click `start-offline.command`
**Linux / macOS terminal:**

```bash
./start-offline.sh
```

Your browser opens <http://localhost:8080/>. Pick a version, press Play.

That is the whole thing. Nothing is downloaded, nothing phones home, and it
keeps working with the network cable unplugged.

> **Why not just double-click `index.html`?**
> You can, and the launcher itself will render. But browsers deny IndexedDB,
> Web Workers and `fetch()` on `file://`, so Eaglercraft cannot save worlds and
> some builds will not boot. The launcher detects this and shows a warning.
> The tiny server in `tools/serve.py` is what makes `http://localhost` work,
> and it binds to your own machine only.

---

## What is bundled

Five self-contained Eaglercraft builds, each a single HTML file with its
assets inlined:

| Version | Path | Source archive |
|---|---|---|
| 1.12.2-u3 | `mc/1.12.2/index.html` | `Eaglercraft_1.12.2_u3_Offline.zip` |
| 1.12.2-u3 WASM | `mc/1.12.2-wasm/index.html` | `Eaglercraft_1.12.2_u3_WASM_Offline.zip` |
| 1.8.8-u53 | `mc/1.8.8/index.html` | `EaglercraftX_1.8_u53_Offline_Signed.zip` |
| 1.8.8-u53 WASM-GC | `mc/1.8.8-wasm/index.html` | `EaglercraftX_1.8_u53_WASM-GC_Offline.zip` |
| 1.5.2-sp2.01 | `mc/1.5.2/index.html` | `Eaglercraft_1.5.2-sp2.01_Offline.zip` |

Each build was checked to contain **zero** remote `<script>`, `<link>`, `<img>`
or `url()` references.

### Singleplayer vs multiplayer

**Singleplayer works completely offline** with nothing else installed.

**Multiplayer** normally goes through public websocket relays on the internet.
Offline, you host your own instead — see [`server/README.md`](server/README.md).

---

## What was replaced, and with what

The point of this rebuild is that nothing outside the six source archives is
fetched at runtime. Here is every dependency that was not one of those
archives, and where it went.

| Before | Problem offline | Now |
|---|---|---|
| `fonts.googleapis.com` + `fonts.gstatic.com` (3 tags in `index.html`) | Only outbound fetch in the launcher; text falls back to a system font | Roboto latin woff2 vendored into `fonts/` from the OFL-licensed `@fontsource/roboto` package, served by `css/fonts.css` |
| 13 hand-written dropdown `<div>`s in `index.html` | 8 of them pointed at `mc/` folders that do not exist → dead links | Dropdown generated from `js/clients.js`; every row either launches a real file or says it is not bundled |
| `mc/1.8.8/?userscript=…` for the mobile/controller entries | The offline builds do not implement userscript loading — the string `userscript` appears **0 times** in all five | Those entries are marked not bundled instead of silently doing nothing |
| `mc/{astraclient,starlikeclient,eaglerforge,resentclient,shadowclient}/` | Folders absent from the repo; 30–300 MB each upstream | Listed, marked not bundled, with the exact path to drop a build into |
| `irv77.github.io` `og:` tags | Pointed at a repository now removed under DMCA | Removed |
| Discord sidebar button navigated the launcher away | A dead link offline stranded you | Opens in a new tab via `window.open` |
| No way to play multiplayer offline | Relays are public internet hosts | `server/` — EaglerXServer v1.1.1 source plus start scripts |

---

## Adding a client that is not bundled

The Modded and Mobile/Controller tabs list clients that are not included. To
add one:

1. Put a self-contained HTML build at the path shown, e.g. `mc/resentclient/index.html`.
2. In `js/clients.js`, flip that entry's `bundled` to `true`.
3. Run `node tools/verify-offline.mjs` to confirm it is still self-contained.

---

## Verifying the offline claim

```bash
node tools/verify-offline.mjs        # optional: npm i jsdom  (enables the DOM test)
```

Four groups of checks:

1. **No network access** — every HTML/CSS/JS file in the repo, including the
   five 15–31 MB game builds, is scanned for anything that opens a connection.
   A canary confirms the scanner would still catch the old Google Fonts tag, so
   the check cannot pass vacuously.
2. **No dangling references** — every local `href` / `src` / `url()` resolves to
   a file on disk.
3. **The launcher works** — `index.html` is loaded in jsdom with
   `js/clients.js` and `js/index.js` executed against it. Every sidebar tab is
   selected, all 13 dropdown rows are clicked, and each resulting Play button
   href must resolve to a real file.
4. **It serves** — `tools/serve.py` is booted and every page is requested over
   HTTP, asserting `200` plus the `Cross-Origin-Opener-Policy` /
   `Cross-Origin-Embedder-Policy` headers the WASM builds need for
   `SharedArrayBuffer`.

Last run: **26 passed, 0 failed**.

---

## Repository layout

```
index.html            launcher UI
css/                  styles + self-hosted font faces
fonts/                Roboto woff2 (latin, 400 + 700)
js/clients.js         client manifest — the single source of truth
js/index.js           launcher behaviour
images/               launcher artwork
mc/<version>/         the five offline game builds
server/               EaglerXServer for local multiplayer
tools/serve.py        local static server with isolation headers
tools/verify-offline.mjs   the offline guarantee test
start-offline.*       one-click launchers
```

---

## Notes

- `.gitattributes` marks `mc/**` as binary. Those files carry base64 payloads;
  a single CRLF normalisation would corrupt them silently.
- The bundled builds are large (≈103 MB total). Clone with
  `git clone --depth 1` if you only need the current version.

## Credits

- **Eaglercraft** — lax1dude and contributors
- **EaglerXServer** — lax1dude, v1.1.1
- **Launcher UI** — irv77
- **Roboto** — Christian Robertson, SIL Open Font License
