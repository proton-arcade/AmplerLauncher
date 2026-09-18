# Ampler Launcher

A Minecraft-themed launcher for Eaglercraft that runs entirely offline.

It is a **website**, not an app: plain HTML/CSS/JS with no build step, no
backend, no installer and no server. It lives in a folder — open
`index.html` in a browser and it works. Nothing is downloaded, nothing
phones home, and nothing here ever asks you to start a server.

## Run it

Open `index.html` in any browser. Pick a version, press Play.

That is all.

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
button in the bottom right. The search box in the head row filters the grid
as you type.

Switching between Play and Skins is free and instant — the top left tabs. On
the Skins page the bar keeps the username and drops the Play button and the
version selector.

There are no popups anywhere in the launcher: no toasts, no notices, no
countdown screens of its own. The only thing that ever opens on top of the
page is a new tab you asked for.

## Skins

**A skin is a folder.** One folder per skin inside `website/skins/`, named
after the skin:

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

A browser cannot list a folder by itself, so the page goes by two lists, in
this order:

1. `website/js/skins.js` — the hand-kept manifest. It decides the order, and
   it is also the way to add a skin with no tools at all:

   ```js
   window.AMPLER_SKINS = [
       { name: 'skin template' },
       { name: 'creeper' },
       { name: 'my skin' }     // <- one line per folder
   ];
   ```

2. `website/skins/list.js` — written by the bake tool so you never have to
   edit anything after dropping a folder in:

   ```
   python3 website/tools/bake-skins.py
   ```

   Run it once after adding or removing a folder in `website/skins/`, reload
   `index.html`, done. It only needs Python 3 — no connection, no server.
   Deleting `website/skins/list.js` is always safe; the page falls back to
   `js/skins.js`.

Either way, a folder that has been deleted is simply skipped instead of
leaving a dead box.

- **No preview file?** Not a problem — the card draws the front of the
  character from the skin file itself (classic 64×64, 64×32 and HD skins all
  work), so a bare `<name>.png` still shows up.

## The download button

Clicking it hands the skin `.png` to the browser exactly as it sits in the
folder — nothing is re-encoded.

How far that click goes depends on where the page lives, because a browser
only lets a page download a file it is allowed to read:

- **Over any http(s) origin** (the folder hosted anywhere static — GitHub
  Pages, a LAN, any plain static host) the file is read with `fetch()` and
  handed back as a blob with the download attribute set. That is a real
  download: the file lands straight in the browser's Downloads.
- **Straight off disk** (`file://`) a page is an opaque origin: every read of
  another file is refused and the download attribute is ignored — clicking a
  bare link would swap the page itself for the raw PNG. The launcher never
  lets that happen: the skin opens in a **new tab** (the browser's own image
  viewer, which has a save button) and the launcher stays where it was.

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

Singleplayer works with no server — the builds are the official Eaglercraft
"offline download" single files, built to be opened directly, which is why
double-clicking `index.html` is the normal way to run this launcher. One
patch is applied to each of them: the built-in *"This file is from … — Game
will launch in 5…"* countdown screen is disabled, so pressing Play boots
straight into the game. The launcher itself is singleplayer-only; it ships
nothing that needs hosting.

## Layout

```
index.html              launcher page
README.md               this file
website/                everything else
  css/ fonts/ images/   launcher assets (font is self-hosted)
  js/                   launcher code + the client and skin lists
  mc/                   the five game builds
  skins/                one folder per skin (see above) + list.js
  tools/                bake-skins.py + the offline checks
```

## Verify

```
node website/tools/verify-offline.mjs     # static offline checks (no browser needed)
node website/tools/browser-test.mjs       # real-browser, off-disk check
```

`verify-offline.mjs` proves that nothing reaches the network, that every
reference resolves, that the client and skin lists agree with what is on
disk (including that `bake-skins.py` output matches the folders on disk),
and that the launcher renders and behaves — the download button included,
both its blob path and its off-disk fallback. `browser-test.mjs` drives
Chromium against the real page off disk, clicks the download button for
real, and can boot the five game builds (`--no-games` skips that).

Both skip cleanly when `jsdom` / `puppeteer-core` (+ a Chromium) are not
installed.

## Credits

Eaglercraft by lax1dude and contributors. Launcher UI by irv77. Roboto
(SIL OFL) via @fontsource.
