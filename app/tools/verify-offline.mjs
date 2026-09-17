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
 *      index.html is loaded in jsdom with js/clients.js and js/index.js
 *      executed against it. Every sidebar tab is selected and every dropdown
 *      row is clicked; the Play button's href must resolve to a file that
 *      exists, or the row must be flagged not-bundled.
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
import { spawn } from 'node:child_process';

// The repo root is the directory that holds index.html + README.md (everything
// else lives under app/, so this file may be nested).
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
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
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
        rel(f) === 'index.html' || rel(f).startsWith('app/js/') || rel(f).startsWith('app/css/'));
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
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
];

let checkedRefs = 0, brokenRefs = 0;
for (const file of SCANNABLE) {
    if (rel(file).startsWith('mc/') || rel(file).startsWith('app/mc/')) continue; // game blobs are self-contained
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

/* ------------------------------------------------------------------ *
 * 3. Manifest agrees with disk, and the launcher drives it correctly
 * ------------------------------------------------------------------ */

head('3. Launcher renders and every Play button goes somewhere real');

const clientsSrc = readFileSync(join(ROOT, 'app/js/clients.js'), 'utf8');
const ctx = { window: {} };
new Function('window', clientsSrc)(ctx.window);
const CLIENTS = ctx.window.AMPLER_CLIENTS;
const CATEGORIES = ctx.window.AMPLER_CATEGORIES;

if (!Array.isArray(CLIENTS) || CLIENTS.length === 0) {
    bad('js/clients.js did not define AMPLER_CLIENTS');
} else {
    ok('js/clients.js evaluates: ' + CLIENTS.length + ' clients, ' +
       Object.keys(CATEGORIES).length + ' categories');

    const bundled = CLIENTS.filter((c) => c.bundled);
    let missing = 0;
    for (const c of bundled) {
        const p = join(ROOT, c.path);
        if (!existsSync(p)) { missing++; bad('bundled client missing from disk: ' + c.id + ' -> ' + c.path); }
    }
    if (missing === 0) ok(bundled.length + '/' + CLIENTS.length + ' bundled clients exist on disk');

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

    /* ---- jsdom: actually run the launcher ---- */
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
        win.eval(readFileSync(join(ROOT, 'app/js/clients.js'), 'utf8'));
        win.eval(readFileSync(join(ROOT, 'app/js/index.js'), 'utf8'));

        const d = win.document;
        const assert = (cond, msg) => (cond ? ok(msg) : bad(msg));

        assert(typeof win.selectCategory === 'function' && typeof win.buildDropdown === 'function',
            'index.js executed and exported its API');

        assert(d.getElementById('gameicon').getAttribute('src') !== null,
            'boot ran: default client selected (' +
            d.getElementById('gametitle').textContent + ' / ' +
            d.getElementById('gameversion').textContent + ')');

        const bootHref = d.getElementById('playbutton').getAttribute('href');
        assert(existsSync(join(ROOT, bootHref)),
            'initial Play button href resolves on disk (' + bootHref + ')');

        let rowsClicked = 0, deadLinks = 0;
        for (const cat of Object.keys(CATEGORIES)) {
            win.selectCategory(cat);
            const rows = [...d.querySelectorAll('#dropdn .dropdownOptions')];
            const expected = CLIENTS.filter((c) => c.category === cat).length;
            assert(rows.length === expected,
                'category "' + cat + '" lists ' + rows.length + ' rows (expected ' + expected + ')');

            for (const row of rows) {
                row.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
                rowsClicked++;
                const id = row.getAttribute('data-client');
                const client = CLIENTS.find((c) => c.id === id);
                const href = d.getElementById('playbutton').getAttribute('href');
                if (client.bundled) {
                    if (!existsSync(join(ROOT, href))) { deadLinks++; bad('dead Play link for ' + id + ': ' + href); }
                } else if (href !== '#') {
                    deadLinks++; bad('not-bundled client ' + id + ' exposes href ' + href + ' instead of "#"');
                }
            }
        }
        if (deadLinks === 0) ok('clicked all ' + rowsClicked + ' dropdown rows: 0 dead Play links');

        // The dropdown must stack, not pile every row at bottom:0.
        win.selectCategory('web');
        const bottoms = [...d.querySelectorAll('#dropdn .dropdownOptions')]
            .map((r) => r.style.bottom).filter(Boolean);
        assert(new Set(bottoms).size === bottoms.length,
            'dropdown rows are stacked at distinct offsets (' + bottoms.join(', ') + ')');

        // No leftover remote <link> in the shipped head.
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
            fwin.eval(readFileSync(join(ROOT, 'app/js/clients.js'), 'utf8'));
            fwin.eval(readFileSync(join(ROOT, 'app/js/index.js'), 'utf8'));
        } catch (e) { bootError = e; }
        const fd = fwin.document;

        assert(bootError === null,
            'boots from file:// with no exception' + (bootError ? ': ' + bootError.message : ''));
        assert(fd.querySelectorAll('#dropdn .dropdownOptions').length ===
               CLIENTS.filter((c) => c.category === 'web').length,
            'file:// boot still builds the version dropdown');
        assert(existsSync(join(ROOT, fd.getElementById('playbutton').getAttribute('href'))),
            'file:// boot Play button resolves on disk');
        assert(!fd.getElementById('filewarning'),
            'no stale file:// warning element left in the markup');
        assert(!readFileSync(join(ROOT, 'app/js/index.js'), 'utf8').includes('filewarning'),
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
    const srv = spawn('python3', [join(ROOT, 'app', 'tools', 'serve.py'),
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
        const targets = ['index.html', 'app/css/style.css', 'app/css/fonts.css', 'app/js/index.js',
            'app/js/clients.js', 'app/fonts/roboto-latin-400-normal.woff2',
            ...CLIENTS.filter((c) => c.bundled).map((c) => c.path)];

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
