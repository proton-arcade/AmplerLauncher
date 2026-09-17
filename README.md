# Ampler Launcher

A Minecraft-themed launcher for Eaglercraft that runs entirely offline.

It is a **website**, not an app: plain HTML/CSS/JS with no build step, no
backend and no installer. Open it in a browser and it works — online or off.

## Run it

Open `index.html` in any browser. Pick a version, press Play.

That is all. Nothing is downloaded and nothing phones home.

Optionally, run the small local server if you want `SharedArrayBuffer` for the
WASM builds or to play from another device on your LAN:

```
./website/start-offline.sh      # or start-offline.bat / .command
```

then use `http://localhost:8080/`.

## What is included

Five self-contained Eaglercraft builds (one HTML file each) under
`website/mc/`:

| Version | Folder |
|---|---|
| 1.12.2-u3 | `website/mc/1.12.2/` |
| 1.12.2-u3 WASM | `website/mc/1.12.2-wasm/` |
| 1.8.8-u53 | `website/mc/1.8.8/` |
| 1.8.8-u53 WASM-GC | `website/mc/1.8.8-wasm/` |
| 1.5.2-sp2.01 | `website/mc/1.5.2/` |

Singleplayer works with no server. For offline multiplayer, `website/server/`
holds EaglerXServer v1.1.1 (see `website/server/README.md`).

## Layout

```
index.html              launcher page
README.md               this file
website/                everything else
  css/ fonts/ images/   launcher assets (font is self-hosted)
  js/                   launcher code + client list
  mc/                   the five game builds
  server/               optional local multiplayer server
  tools/                serve.py + the offline checks
  start-offline.*       optional one-click launchers
```

## Verify

```
node website/tools/verify-offline.mjs     # static offline checks
node website/tools/browser-test.mjs       # real-browser, no-server check
```

## Credits

Eaglercraft and EaglerXServer by lax1dude and contributors. Launcher UI by
irv77. Roboto (SIL OFL) via @fontsource.
