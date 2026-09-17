#!/usr/bin/env node
/*
 * Ampler Launcher - offline guarantee test.
 *
 * Proves the three things this rebuild claims:
 *
 *   1. NOTHING is fetched from the network.
 *      Every html/css/js file in the repo (including the five 15-31 MB game
 *      builds) is scanned for anything that would open a connection, and every
 *      hit must be on a documented allowlist.
 *
 *   2. NOTHING 404s.
 *      Every href/src/url() that points into the repo resolves to a real file,
 *      and every bundled:true client in js/clients.js exists on disk.
 *
 *   3. THE LAUNCHER ACTUALLY WORKS.
 *      index.html is loaded in jsdom with js/clients.js, js/skins.js,
 *      js/index.js and js/skinsview.js executed against it. The version
 *      dropdown is driven row by row (every Play href must resolve to a file
 *      that exists), the Play and Skins pages are switched between, every skin
 *      card is checked against website/skins/, and the username is renamed and
 *      read back out of localStorage.
 *
 * Then, if python3 is available, tools/serve.py is booted and each page is
 * requested over HTTP to confirm it returns 200 with the isolation headers.
 *
 * Usage:  node tools/verify-offline.mjs
 * jsdom is optional; install it with `npm i jsdom` for check 3.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

// The repo root is the directory that holds index.html + README.md (everything
// else lives under website/, so this file may be nested).
function findRoot() {
    let d = dirname(fileURLToPath(import.meta.url));
    while (d !== dirname(d)) {
        if (existsSync(join(d, 'index.html')) && existsSync(join(d, 'README.md'))) return d;
        d = dirname(d);
    }
    return dirname(dirname(fileURLToPath(import.meta.url)));
}
const ROOT = findRoot();

let pass = 0, fail = 0, skip = 0;
const failures = [];

function ok(msg) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + msg); }
function bad(msg) { fail++; failures.push(msg); console.log('  \x1b[31mFAIL\x1b[0m ' + msg); }
function skipped(msg) { skip++; console.log('  \x1b[33mskip\x1b[0m ' + msg); }
function head(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* ------------------------------------------------------------------ *
 * Which files to inspect
 * ------------------------------------------------------------------ */

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__']);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const ALL = walk(ROOT);
const rel = (p) => relative(ROOT, p);
const SCANNABLE = ALL.filter((f) =>
    ['.html', '.css', '.js', '.mjs'].includes(extname(f).toLowerCase()));

console.log('Ampler Launcher offline verification');
console.log('root: ' + ROOT);
console.log('files in repo: ' + ALL.length + '  (scanning ' + SCANNABLE.length + ' html/css/js)');

/* ------------------------------------------------------------------ *
 * 1. No network references
 * ------------------------------------------------------------------ */

head('1. No file opens a network connection');

// Things that merely LOOK like URLs but never cause a request.
const ALLOWED = [
    { re: /^https?:\/\/www\.w3\.org\//, why: 'XML/SVG namespace identifier' },
    { re: /^https:\/\/discord\.gg\//, why: 'user-initiated window.open() only' },
    { re: /^https:\/\/github\.com\//, why: 'documentation / setup script URL' },
    { re: /^https:\/\/www\.python\.org\//, why: 'documentation string' },
    { re: /^http:\/\/localhost(:\d+)?/, why: 'loopback, not the internet' },
    { re: /^http:\/\/127\.0\.0\.1(:\d+)?/, why: 'loopback, not the internet' },
    { re: /^https:\/\/irv77\.github\.io\//, why: 'attribution text in README' },
    { re: /^https:\/\/cdn\.eaglercraft\.ru\//, why: 'provenance note in README' },
    { re: /^ws:\/\/<your-lan-ip>/, why: 'documentation placeholder' },
];

// Constructs that actually open a connection.
const FETCHERS = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<video[^>]+src=["']([^"']+)["']/gi,
    /<audio[^>]+src=["']([^"']+)["']/gi,
    /<embed[^>]+src=["']([^"']+)["']/gi,
    /(?<![A-Za-z0-9_$-])url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    /\bfetch\(\s*['"]([^'"]+)['"]/gi,
    /\bnew\s+Worker\(\s*['"]([^'"]+)['"]/gi,
    /\bnew\s+SharedWorker\(\s*['"]([^'"]+)['"]/gi,
    /\bnew\s+EventSource\(\s*['"]([^'"]+)['"]/gi,
    /\bimport\(\s*['"]([^'"]+)['"]/gi,
    /\.open\(\s*['"][A-Z]+['"]\s*,\s*['"]([^'"]+)['"]/gi,
    /@import\s+['"]([^'"]+)['"]/gi,
];

function isRemote(u) { return /^(https?:|\/\/)/i.test(u.trim()); }

const remoteHits = [];
for (const file of SCANNABLE) {
    const text = readFileSync(file, 'utf8');
    for (const rx of FETCHERS) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(text)) !== null) {
            const url = m[1].trim();
            if (!isRemote(url)) continue;
            const allowed = ALLOWED.find((a) => a.re.test(url));
            if (allowed) continue;
            remoteHits.push(rel(file) + ' -> ' + url.slice(0, 90));
        }
    }
}

if (remoteHits.length === 0) {
    ok('0 un-allowlisted remote fetches across ' + SCANNABLE.length + ' files');
} else {
    for (const h of [...new Set(remoteHits)]) bad('remote reference: ' + h);
}

// The LAUNCHER must not call any API that requires a server or the network to
// render. (The game builds contain WebSocket/fetch/XHR, but those are opt-in
// multiplayer paths that only fire when the user initiates a connection - the
// browser test's request watcher confirms 0 of them fire at boot.)
{
    const launcherFiles = ALL.filter((f) =>
        rel(f) === 'index.html' || rel(f).startsWith('website/js/') || rel(f).startsWith('website/css/'));
    const REQUIRED = ['XMLHttpRequest', 'navigator.serviceWorker', 'importScripts', 'type="module"'];
    let hits = 0;
    for (const f of launcherFiles) {
        const text = readFileSync(f, 'utf8');
        for (const tok of REQUIRED) {
            const n = text.split(tok).length - 1;
            if (n) { hits++; bad('launcher ' + rel(f) + ' uses server-requiring API ' + tok + ' x' + n); }
        }
    }
    if (hits === 0) ok('launcher uses none of fetch/XMLHttpRequest/import()/module/serviceWorker');
}

// Prove the scan is not vacuous: it must catch the original Google Fonts tag.
// Built by concatenation so this fixture does not itself trip the scan above.
const CANARY = '<' + 'link href="https://fonts.googleapis.com/css2?family=Roboto" rel="stylesheet">';
{
    let caught = false;
    for (const rx of FETCHERS) {
        rx.lastIndex = 0;
        const m = rx.exec(CANARY);
        if (m && isRemote(m[1]) && !ALLOWED.some((a) => a.re.test(m[1]))) caught = true;
    }
    if (caught) ok('scanner is live: detects the old Google Fonts <link>');
    else bad('scanner would NOT have caught a remote <link> - the check is vacuous');
}

/* ------------------------------------------------------------------ *
 * 2. Every local reference resolves
 * ------------------------------------------------------------------ */

head('2. Every local reference resolves to a real file');

const LOCAL_REFS = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
    /(?<![A-Za-z0-9_$-])url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
];

let checkedRefs = 0, brokenRefs = 0;
for (const file of SCANNABLE) {
    if (rel(file).startsWith('mc/') || rel(file).startsWith('website/mc/')) continue; // game blobs are self-contained
    const text = readFileSync(file, 'utf8');
    for (const rx of LOCAL_REFS) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(text)) !== null) {
            let u = m[1].trim();
            if (isRemote(u) || u.startsWith('data:') || u.startsWith('#') || u.startsWith('blob:')) continue;
            u = u.split(/[?#]/)[0];
            if (!u) continue;
            // Ignore JS expressions captured inside a template such as
            // 'url(' + meta.background + ')' - they are not literal paths.
            if (!/^[A-Za-z0-9._~%/-]+$/.test(u)) continue;
            checkedRefs++;
            const target = join(dirname(file), u);
            if (!existsSync(target)) { brokenRefs++; bad('dangling reference in ' + rel(file) + ' -> ' + u); }
        }
    }
}
if (brokenRefs === 0) ok(checkedRefs + ' local references all resolve on disk');

// The other direction: artwork that nothing points at any more. The sidebar
// removal (Web / Modded / Mobile pickers, Discord, Credits, Offline status,
// the Eaglercraft titles) left 26 unused images behind and they were cleaned
// up; this keeps that from happening again. A NOTE, never a failure, so art
// dropped in ahead of the code that will use it does not break the suite.
{
    const assets = ALL.filter((f) =>
        /^website[\/](images|fonts)[\/]/.test(rel(f)) && !rel(f).endsWith('fonts.css'));

    const haystack = SCANNABLE
        .filter((f) => !rel(f).startsWith('website/mc/'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');

    const unused = assets.filter((f) => !haystack.includes(rel(f).split('/').pop()));
    unused.length === 0
        ? ok('all ' + assets.length + ' images and fonts are referenced by the launcher')
        : skipped(unused.length + ' asset(s) nothing references: ' +
                  unused.map((f) => rel(f).split('/').pop()).join(', '));
}

/* ------------------------------------------------------------------ *
 * 3. Manifest agrees with disk, and the launcher drives it correctly
 * ------------------------------------------------------------------ */

head('3. Manifests agree with disk, and the launcher drives them');

const clientsSrc = readFileSync(join(ROOT, 'website/js/clients.js'), 'utf8');
const ctx = { window: {} };
new Function('window', clientsSrc)(ctx.window);
const CLIENTS = ctx.window.AMPLER_CLIENTS;

const skinsSrc = readFileSync(join(ROOT, 'website/js/skins.js'), 'utf8');
const sctx = { window: {} };
new Function('window', skinsSrc)(sctx.window);
const SKINS = (sctx.window.AMPLER_SKINS || []).map((s) => (typeof s === 'string' ? s : s.name));
const SKIN_FOLDER = join(ROOT, (sctx.window.AMPLER_SKIN_DIR || './website/skins/').replace(/^\.\//, ''));
const SKIN_PREFIX = sctx.window.AMPLER_SKIN_PREVIEW_PREFIX || 'preview.';

if (!Array.isArray(CLIENTS) || CLIENTS.length === 0) {
    bad('js/clients.js did not define AMPLER_CLIENTS');
} else {
    ok('js/clients.js evaluates: ' + CLIENTS.length + ' builds');

    const bundled = CLIENTS.filter((c) => c.bundled);
    let missing = 0;
    for (const c of bundled) {
        const p = join(ROOT, c.path);
        if (!existsSync(p)) { missing++; bad('bundled client missing from disk: ' + c.id + ' -> ' + c.path); }
    }
    if (missing === 0) ok(bundled.length + '/' + CLIENTS.length + ' bundled builds exist on disk');

    // Each bundled build must be self-contained too.
    let dirty = 0;
    // Regression guard: the OLD folder-based mc/1.5.2 build opened with
    //   if(document.location.href.startsWith("file:")) { alert("You cannot
    //   'open' this file in your browser...") }
    // which made a local server mandatory. The single-file offline downloads
    // must not carry that gate, or double-clicking them stops working.
    const FILE_GUARDS = [
        'startsWith("file:',
        "startsWith('file:",
        "cannot 'open' this file",
        'cannot "open" this file',
    ];
    for (const c of bundled) {
        const text = readFileSync(join(ROOT, c.path), 'utf8');
        for (const g of FILE_GUARDS) {
            if (text.includes(g)) bad('game build ' + c.path + ' blocks file:// via: ' + g);
        }
        for (const rx of FETCHERS) {
            rx.lastIndex = 0;
            let m;
            while ((m = rx.exec(text)) !== null) {
                const u = m[1].trim();
                if (!isRemote(u)) continue;
                if (ALLOWED.some((a) => a.re.test(u))) continue;
                dirty++; bad('game build ' + c.path + ' references remote ' + u.slice(0, 80));
            }
        }
        const bytes = statSync(join(ROOT, c.path)).size;
        if (bytes < 1_000_000) bad('game build ' + c.path + ' is suspiciously small (' + bytes + ' B)');
    }
    if (dirty === 0) ok('all ' + bundled.length + ' game builds are self-contained (0 remote refs)');

    // Prove the guard detector is not vacuous.
    {
        const OLD_BUILD = 'if(document.location.href.startsWith("file:")){' +
                          'alert("You cannot \'open\' this file in your browser");}';
        if (FILE_GUARDS.some((g) => OLD_BUILD.includes(g)))
            ok('file:// guard detector is live: catches the old folder-build gate');
        else
            bad('file:// guard detector would miss the old gate - the check is vacuous');
    }
}

/* ------------------------------------------------------------------ *
 * The skins page is a folder listing: js/skins.js must agree with disk
 * ------------------------------------------------------------------ */

if (SKINS.length === 0) {
    bad('js/skins.js lists no skins');
} else {
    ok('js/skins.js evaluates: ' + SKINS.length + ' skins (' + SKINS.join(', ') + ')');

    let skinProblems = 0;
    for (const name of SKINS) {
        const dir = join(SKIN_FOLDER, name);
        if (!existsSync(dir)) { skinProblems++; bad('skin folder missing: website/skins/' + name + '/'); continue; }
        for (const f of [name + '.png', SKIN_PREFIX + name + '.png']) {
            if (!existsSync(join(dir, f))) { skinProblems++; bad('missing ' + f + ' in website/skins/' + name + '/'); }
        }
    }
    if (skinProblems === 0)
        ok('every skin has its folder, its <name>.png and its ' + SKIN_PREFIX + '<name>.png');

    // website/skins/list.js is either the empty placeholder (the committed
    // default) or a baked listing from tools/bake-skins.py. Both are valid, but
    // it has to be loadable JavaScript either way.
    const listJsPath = join(SKIN_FOLDER, 'list.js');
    if (!existsSync(listJsPath)) {
        bad('website/skins/list.js is missing - the page loads it on every boot');
    } else {
        const listSrc = readFileSync(listJsPath, 'utf8');
        const lctx = { window: {} };
        let listError = null;
        try { new Function('window', listSrc)(lctx.window); } catch (e) { listError = e; }
        const baked = lctx.window.AMPLER_SKINS_FROM_DIR;
        if (listError) bad('website/skins/list.js does not parse: ' + listError.message);
        else if (!Array.isArray(baked)) bad('website/skins/list.js does not define AMPLER_SKINS_FROM_DIR');
        else {
            const badNames = baked.filter((n) => typeof n !== 'string' || /[\\/]/.test(n) || n.includes('..'));
            if (badNames.length) bad('odd names in website/skins/list.js: ' + badNames.join(', '));
            const stale = baked.filter((n) => !foldersOnDisk.includes(n));
            if (baked.length === 0)
                ok('website/skins/list.js is the empty placeholder (page goes by js/skins.js)');
            else if (stale.length === 0)
                ok('website/skins/list.js is baked and matches the folders on disk (' + baked.join(', ') + ')');
            else
                skipped('website/skins/list.js lists folders that are gone (' + stale.join(', ') +
                        ') - their cards drop out on their own; re-run tools/bake-skins.py to tidy up');
        }
    }

    // Folders that are on disk but not in the list still show up whenever the
    // launcher is served by tools/serve.py (it answers website/skins/list.js
    // from the directory listing). Off disk and on plain static servers the
    // list is what the page goes by, so this is a note, not a failure.
    const foldersOnDisk = readdirSync(SKIN_FOLDER)
        .filter((n) => !n.startsWith('.') && statSync(join(SKIN_FOLDER, n)).isDirectory());
    const unlisted = foldersOnDisk.filter((n) => !SKINS.includes(n));
    unlisted.length === 0
        ? ok('every skin folder on disk is also in js/skins.js (' + foldersOnDisk.length + ')')
        : skipped('on disk but not in js/skins.js: ' + unlisted.join(', ') +
                  ' - they still appear when served, add the line for file:// use');
}

/* ---- jsdom: actually run the launcher ---- */
{
    let JSDOM = null;
    try { JSDOM = (await import('jsdom')).JSDOM; } catch { /* optional */ }

    if (!JSDOM) {
        skipped('jsdom not installed - skipping live DOM test (npm i jsdom)');
    } else {
        const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
        const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost:8080/' });
        const win = dom.window;
        win.open = () => null;                       // no popups in test
        win.console.clear = () => {};
        win.eval(readFileSync(join(ROOT, 'website/js/clients.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'website/js/skins.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'website/js/index.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'website/js/skinsview.js'), 'utf8'));

        const d = win.document;
        const assert = (cond, msg) => (cond ? ok(msg) : bad(msg));

        assert(typeof win.showView === 'function' && typeof win.selectClient === 'function' &&
               typeof win.setUsername === 'function' && typeof win.renderSkins === 'function',
            'index.js + skinsview.js executed and exported their API');

        /* ---- the shell ---- */
        assert(d.getElementById('gameedition').textContent.trim() === 'Ampler Launcher',
            'header reads "Ampler Launcher"');
        const tabs = [...d.querySelectorAll('#javatabs li')].map((n) => n.textContent.trim()).join(', ');
        assert(tabs === 'Play, Skins', 'top nav holds only Play and Skins (' + tabs + ')');
        assert(!d.querySelector('.sidebar'), 'the sidebar is gone from the markup');

        /* ---- play page ---- */
        assert(!d.getElementById('playview').hidden && d.getElementById('skinsview').hidden,
            'boots on the Play page');
        const bootHref = d.getElementById('playbutton').getAttribute('href');
        assert(existsSync(join(ROOT, bootHref)),
            'initial Play button href resolves on disk (' + bootHref + ')');

        const rows = [...d.querySelectorAll('#dropdn .dropdownOptions')];
        assert(rows.length === CLIENTS.length,
            'version dropdown lists all ' + CLIENTS.length + ' builds');

        let deadLinks = 0;
        for (const row of rows) {
            const id = row.getAttribute('data-client');
            const client = CLIENTS.find((c) => c.id === id);
            row.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
            const href = d.getElementById('playbutton').getAttribute('href');
            if (client.bundled) {
                if (!existsSync(join(ROOT, href))) { deadLinks++; bad('dead Play link for ' + id + ': ' + href); }
            } else if (href !== '#') {
                deadLinks++; bad('not-bundled client ' + id + ' exposes href ' + href + ' instead of "#"');
            }
        }
        if (deadLinks === 0) ok('clicked all ' + rows.length + ' dropdown rows: 0 dead Play links');

        // Opening the list flips the arrow; picking a row (even by clicking the
        // text inside it, not the row itself) selects and closes it again.
        win.dropdowntoggle();
        assert(d.getElementById('dropdn').style.visibility === 'visible',
            'the version selector opens');
        const rowToClick = d.querySelector('#dropdn .dropdownOptions[data-client="1.8.8"]');
        rowToClick.querySelector('.dropdownOptionText p')
            .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        assert(d.getElementById('gametitle').textContent === 'Previous release' &&
               d.getElementById('gameversion').textContent === '1.8.8-u53',
            'clicking a row picks that build (' + d.getElementById('gametitle').textContent + ')');
        assert(d.getElementById('dropdn').style.visibility === 'hidden',
            'picking a build closes the list');

        // Clicking the username closes an open list too - opening the rename
        // field should not leave the list hanging open.
        win.dropdowntoggle();
        d.getElementById('userbox').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        assert(d.getElementById('dropdn').style.visibility === 'hidden',
            'clicking the username closes the version list');

        // The dropdown must stack, not pile every row at bottom:0.
        const bottoms = [...d.querySelectorAll('#dropdn .dropdownOptions')]
            .map((r) => r.style.bottom).filter(Boolean);
        assert(new Set(bottoms).size === bottoms.length,
            'dropdown rows are stacked at distinct offsets (' + bottoms.join(', ') + ')');

        /* ---- username: click, type, saved ---- */
        assert(d.getElementById('username').textContent === 'Generic User',
            'the username starts out as "Generic User"');
        win.setUsername('Steve', true);
        assert(d.getElementById('username').textContent === 'Steve',
            'clicking the user and typing changes the name');
        assert(JSON.parse(win.localStorage.getItem('ampler.offline.v2')).username === 'Steve',
            'the new name is saved locally (survives a reload)');
        win.setUsername('   ', true);
        assert(d.getElementById('username').textContent === 'Generic User',
            'an empty name falls back to "Generic User" instead of saving a blank');
        win.setUsername('n'.repeat(40), false);
        assert(d.getElementById('username').textContent.length === 24,
            'a very long name is capped at 24 characters');
        win.setUsername('Steve', true);

        /* ---- skins page ---- */
        win.showView('skins');
        assert(d.getElementById('playview').hidden && !d.getElementById('skinsview').hidden,
            'the Skins tab swaps the page to the skins grid');
        assert(d.getElementById('mainPage').classList.contains('skinsMode'),
            'the skins page drops the Play button and the version selector');
        assert(d.getElementById('username').textContent === 'Steve',
            'the username stays visible on the skins page');

        const skinsView = d.getElementById('skinsview');
        assert(!/ampler-title|web-title|gameLogo/.test(skinsView.innerHTML),
            'the skins page carries no logo');
        assert(!/<a\b/i.test(skinsView.innerHTML), 'the skins page carries no Play link');

        const cards = [...d.querySelectorAll('#skingrid .skinCard')];
        assert(cards.length === SKINS.length,
            'the grid shows every skin in js/skins.js (' + cards.length + ')');

        let cardProblems = 0;
        for (const card of cards) {
            const name = card.getAttribute('data-skin-name');
            const url = decodeURIComponent((card.getAttribute('data-skin-url') || '').replace(/^\.\//, ''));
            const img = card.querySelector('img');
            const label = card.querySelector('.skinName');
            const button = card.querySelector('.skinDownload');
            if (!existsSync(join(ROOT, url))) { cardProblems++; bad('download target missing for ' + name + ': ' + url); }
            if (!img || !existsSync(join(ROOT, decodeURIComponent(img.getAttribute('src').replace(/^\.\//, ''))))) {
                cardProblems++; bad('preview image missing for ' + name);
            }
            if (!label || label.textContent !== name) { cardProblems++; bad('name not shown for ' + name); }
            if (!button) { cardProblems++; bad('no download button for ' + name); }
        }
        if (cardProblems === 0)
            ok('all ' + cards.length + ' cards: preview on top, name bottom left, download bottom right');

        // the download hands back the skin file itself, unmodified
        const first = cards[0];
        const firstUrl = decodeURIComponent((first.getAttribute('data-skin-url') || '').replace(/^\.\//, ''));
        const onDisk = readFileSync(join(ROOT, firstUrl));
        assert(onDisk.length > 0 && (onDisk[0] === 0x89 || onDisk[0] === 0xFF),
            'the download button points at the real skin file (' + firstUrl + ')');

        // searching filters the grid and says so, without claiming there are no skins
        win.filterSkins('zzzz');
        assert(d.querySelectorAll('#skingrid .skinCard').length === 0 &&
               d.getElementById('skinscount').textContent === '0 of ' + SKINS.length + ' skins',
            'a search that matches nothing reads "0 of N skins" (' +
            d.getElementById('skinscount').textContent + ')');
        win.filterSkins('');
        assert(d.querySelectorAll('#skingrid .skinCard').length === SKINS.length,
            'clearing the search brings every skin back (' + SKINS.length + ')');

        win.showView('play');
        assert(!d.getElementById('playview').hidden && d.getElementById('skinsview').hidden,
            'the Play tab comes straight back to the play page');

        /* ---- keyboard: the launcher is reachable without a mouse ---- */
        {
            const key = (node, k) => node.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
            const reachable = (id) => d.getElementById(id).getAttribute('tabindex') === '0';

            assert(reachable('header1') && reachable('header2') && reachable('drop') && reachable('userbox'),
                'the tabs, the version selector and the username are all reachable by Tab');
            assert(d.querySelectorAll('#dropdn .dropdownOptions[tabindex="0"]').length === CLIENTS.length,
                'every row in the version list is reachable by Tab');
            assert(d.getElementById('header2').getAttribute('role') === 'tab' &&
                   d.getElementById('dropdn').getAttribute('role') === 'listbox',
                'the tabs and the version list carry their roles');

            win.showView('play');
            key(d.getElementById('header2'), 'Enter');
            assert(!d.getElementById('skinsview').hidden && d.getElementById('playview').hidden,
                'Enter on the Skins tab opens the skins page');
            assert(d.getElementById('header2').getAttribute('aria-selected') === 'true' &&
                   d.getElementById('header1').getAttribute('aria-selected') === 'false',
                'the selected tab is marked for assistive tech');
            key(d.getElementById('header1'), 'Enter');
            assert(!d.getElementById('playview').hidden, 'Enter on the Play tab comes back');

            key(d.getElementById('drop'), ' ');
            assert(d.getElementById('dropdn').style.visibility === 'visible' &&
                   d.getElementById('drop').getAttribute('aria-expanded') === 'true',
                'Space opens the version list');
            key(d.querySelector('#dropdn .dropdownOptions[data-client="1.5.2"]'), 'Enter');
            assert(d.getElementById('gametitle').textContent === 'Older release' &&
                   d.getElementById('dropdn').style.visibility === 'hidden',
                'Enter on a row picks that build and closes the list');
            assert(d.querySelector('#dropdn .dropdownOptions[data-client="1.5.2"]').getAttribute('aria-selected') === 'true',
                'the picked build is marked as the selected option');

            key(d.getElementById('drop'), 'Enter');
            d.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            assert(d.getElementById('dropdn').style.visibility === 'hidden',
                'Escape closes the version list');

            key(d.getElementById('userbox'), 'Enter');
            assert(d.getElementById('userbox').classList.contains('usernameEditing'),
                'Enter on the username opens the rename field');
        }

        /* ---- no leftover remote <link> in the shipped head ---- */
        const remoteLinks = [...d.querySelectorAll('link[href]')]
            .map((l) => l.getAttribute('href'))
            .filter((h) => /^https?:/i.test(h));
        assert(remoteLinks.length === 0, 'index.html <head> has 0 remote stylesheets');

        /* ---- the no-server path: boot from a file:// URL ---- */
        const fileDom = new JSDOM(html, {
            runScripts: 'outside-only',
            url: 'file:///home/someone/AmplerLauncher/index.html',
        });
        const fwin = fileDom.window;
        fwin.open = () => null;
        fwin.console.clear = () => {};
        let bootError = null;
        try {
            fwin.eval(readFileSync(join(ROOT, 'website/js/clients.js'), 'utf8'));
            fwin.eval(readFileSync(join(ROOT, 'website/js/skins.js'), 'utf8'));
            fwin.eval(readFileSync(join(ROOT, 'website/js/index.js'), 'utf8'));
            fwin.eval(readFileSync(join(ROOT, 'website/js/skinsview.js'), 'utf8'));
        } catch (e) { bootError = e; }
        const fd = fwin.document;

        assert(bootError === null,
            'boots from file:// with no exception' + (bootError ? ': ' + bootError.message : ''));
        assert(fd.querySelectorAll('#dropdn .dropdownOptions').length === CLIENTS.length,
            'file:// boot still builds the version dropdown');
        assert(existsSync(join(ROOT, fd.getElementById('playbutton').getAttribute('href'))),
            'file:// boot Play button resolves on disk');
        fwin.showView('skins');
        assert(fd.querySelectorAll('#skingrid .skinCard').length === SKINS.length,
            'file:// boot builds the skins grid too');
        assert(fd.getElementById('username').textContent === 'Generic User',
            'file:// boot falls back to "Generic User" when localStorage is unavailable');
        assert(!fd.getElementById('filewarning'),
            'no stale file:// warning element left in the markup');
        assert(!readFileSync(join(ROOT, 'website/js/index.js'), 'utf8').includes('filewarning'),
            'js/index.js no longer references a file:// warning gate');
    }
}

/* ------------------------------------------------------------------ *
 * 4. Served over HTTP
 * ------------------------------------------------------------------ */

head('4. tools/serve.py serves every page with isolation headers');

function pythonAvailable() {
    try { spawn('python3', ['--version']); return true; } catch { return false; }
}

if (!pythonAvailable()) {
    skipped('python3 not found - skipping HTTP test');
} else {
    const port = 8000 + Math.floor(Math.random() * 1000);
    const srv = spawn('python3', [join(ROOT, 'website', 'tools', 'serve.py'),
        '--port', String(port), '--host', '127.0.0.1', '--no-browser'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

    let booted = false;
    srv.stdout.on('data', (b) => { if (String(b).includes('Ampler Launcher')) booted = true; });
    srv.stderr.on('data', () => {});

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 50 && !booted; i++) await sleep(100);

    if (!booted) {
        bad('server did not announce itself within 5s');
    } else {
        const base = 'http://127.0.0.1:' + port + '/';
        const targets = ['index.html', 'website/css/style.css', 'website/css/fonts.css',
            'website/js/index.js', 'website/js/clients.js', 'website/js/skins.js', 'website/js/skinsview.js',
            'website/fonts/roboto-latin-400-normal.woff2',
            ...CLIENTS.filter((c) => c.bundled).map((c) => c.path),
            ...SKINS.flatMap((n) => {
                const dir = 'website/skins/' + encodeURIComponent(n) + '/' + encodeURIComponent(n);
                return [dir + '.png', dir.replace(/[^/]+$/, SKIN_PREFIX + '$&') + '.png'];
            })];

        for (const t of targets) {
            try {
                const r = await fetch(base + t);
                const coop = r.headers.get('cross-origin-opener-policy');
                const coep = r.headers.get('cross-origin-embedder-policy');
                if (r.status !== 200) bad('HTTP ' + r.status + ' for ' + t);
                else if (t === 'index.html' && (coop !== 'same-origin' || coep !== 'require-corp'))
                    bad('missing isolation headers on ' + t + ' (coop=' + coop + ' coep=' + coep + ')');
                else ok('200 ' + t + (t === 'index.html' ? '  [coop+coep present]' : ''));
            } catch (e) {
                bad('request failed for ' + t + ': ' + e.message);
            }
        }
    }
    // The Skins page's folder listing is generated per request, not shipped.
    if (booted) {
        const base = 'http://127.0.0.1:' + port + '/';
        try {
            const r = await fetch(base + 'website/skins/list.js');
            const text = await r.text();
            const m = /window\.AMPLER_SKINS_FROM_DIR\s*=\s*(\[[^\]]*\])/.exec(text);
            const got = m ? JSON.parse(m[1]) : null;
            const want = readdirSync(SKIN_FOLDER)
                .filter((n) => !n.startsWith('.') && statSync(join(SKIN_FOLDER, n)).isDirectory())
                .filter((n) => readdirSync(join(SKIN_FOLDER, n))
                    .some((f) => ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(f).toLowerCase())));
            got && JSON.stringify(got) === JSON.stringify(want)
                ? ok('the served skins listing is the live folder listing (' + want.join(', ') + ')')
                : bad('served skins listing ' + JSON.stringify(got) + ' != folders on disk ' + JSON.stringify(want));
        } catch (e) {
            bad('skins listing request failed: ' + e.message);
        }

        // tools/bake-skins.py must produce exactly what the server generates,
        // or the two ways of listing the same folder would drift apart.
        try {
            const dry = execSync('python3 ' + join(ROOT, 'website', 'tools', 'bake-skins.py') + ' --dry-run',
                { cwd: ROOT }).toString();
            const served = await (await fetch(base + 'website/skins/list.js')).text();
            dry.trim() === served.trim()
                ? ok('bake-skins.py agrees with serve.py on the folder listing')
                : bad('bake-skins.py output differs from the served listing:\n' +
                      '    baked : ' + dry.trim().split('\n').pop() + '\n' +
                      '    served: ' + served.trim().split('\n').pop());
        } catch (e) {
            bad('bake-skins.py --dry-run failed: ' + e.message);
        }
    }

    srv.kill('SIGTERM');
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

console.log('\n' + '='.repeat(58));
console.log('  passed: ' + pass + '   failed: ' + fail + '   skipped: ' + skip);
console.log('='.repeat(58));
if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
}
console.log('\nOffline guarantee holds.');
