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

## The launcher

Full screen, two pages, and a little bar along the bottom.

**Play page** — the Eaglercraft artwork with the Ampler Launcher wordmark over
it. The bottom bar holds three things:

| Bottom bar | |
|---|---|
| version selector | the list of installed builds, built from `website/js/clients.js` |
| Play | opens the selected build in a new tab |
| username | click it, type a name, press Enter — it is saved and shown on every page |

**Skins page** — the same background with a box per skin on top of it: the
preview picture on top, the name in the bottom left corner and the download
button in the bottom right. The download button hands you the skin `.png`
exactly as it sits on disk.

Switching between Play and Skins is free and instant — the top left tabs. On
the Skins page the bar keeps the username and drops the Play button and the
version selector.

## Skins

**A skin is a folder.** No setup, no build step, nothing to configure:

```
website/skins/
  skin template/
    skin template.png            <- the skin itself
    preview.skin template.png    <- the picture on the card
  creeper/
    creeper.png
    preview.creeper.png
```

The folder name is the skin name. The two files inside follow the pattern

```
<name>.png            the skin
preview.<name>.png    the preview picture
```

then the folder gets one line in `website/js/skins.js`:

```js
window.AMPLER_SKINS = [
    { name: 'skin template' },
    { name: 'creeper' },
    { name: 'my skin' }        // <- drop the folder in, add the line
];
```

To remove a skin, delete the folder and its line. To reorder the page, reorder
the lines.

- **No preview file?** Not a problem — the card draws the front of the
  character from the skin file itself (classic 64×64 and HD skins both work),
  so a bare `<name>.png` still shows up.
- **Trying one out?** The `Add skin folder` button on the Skins page loads
  folders straight off your disk for the session, without touching the repo.
  (A page opened as `file://` cannot walk folders, so that button is for the
  served/local-server case and for browsers that allow it.)

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
  js/                   launcher code + the client and skin lists
  mc/                   the five game builds
  skins/                one folder per skin (see above)
  server/               optional local multiplayer server
  tools/                serve.py + the offline checks
  start-offline.*       optional one-click launchers
```

## Verify

```
node website/tools/verify-offline.mjs     # static offline checks (no browser needed)
node website/tools/browser-test.mjs       # real-browser, no-server check
```

`verify-offline.mjs` proves that nothing reaches the network, that every
reference resolves, that the client and skin lists agree with what is on disk,
and that the launcher renders and behaves. `browser-test.mjs` drives Chromium
against the real page, off disk and over http://, and can boot the five game
builds (`--no-games` skips that).

## Credits

Eaglercraft and EaglerXServer by lax1dude and contributors. Launcher UI by
irv77. Roboto (SIL OFL) via @fontsource.
