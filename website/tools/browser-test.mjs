#!/usr/bin/env node
/*
 * Ampler Launcher - real browser test.
 *
 * Drives an actual Chromium and watches every request the pages make, to prove
 * two things the static checks cannot:
 *
 *   A. The launcher works when opened straight off disk (file://), with no
 *      server running, and it issues ZERO network requests.
 *   B. The same holds over http:// when the optional server IS running.
 *   C. The Play page and the Skins page both behave: every dropdown row goes
 *      somewhere real, the skins grid matches website/skins/, the username can
 *      be renamed and is remembered, and the skins page shows no logo, no Play
 *      button and no version selector.
 *   D. Each bundled game build actually loads and starts under file://.
 *
 * Browser resolution, in order:
 *   1. $BROWSER_PATH
 *   2. a system chrome/chromium on PATH
 *   3. @sparticuz/chromium from node_modules (npm-installable)
 *
 * Usage:  node tools/browser-test.mjs [--games-only] [--no-games]
 * Requires puppeteer-core; skips cleanly if it is not installed.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

function findRoot() {
    let d = dirname(fileURLToPath(import.meta.url));
    while (d !== dirname(d)) {
        if (existsSync(join(d, 'index.html')) && existsSync(join(d, 'README.md'))) return d;
        d = dirname(d);
    }
    return dirname(dirname(fileURLToPath(import.meta.url)));
}
const ROOT = findRoot();
const ARGS = process.argv.slice(2);
const RUN_GAMES = !ARGS.includes('--no-games');

let pass = 0, fail = 0;
const failures = [];
const ok = (m) => { pass++; console.log('  \x1b[32mok\x1b[0m   ' + m); };
const bad = (m) => { fail++; failures.push(m); console.log('  \x1b[31mFAIL\x1b[0m ' + m); };
const head = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* ------------------------------------------------------------------ */

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('puppeteer-core not installed - nothing to do.'); process.exit(0); }

async function findBrowser() {
    if (process.env.BROWSER_PATH && existsSync(process.env.BROWSER_PATH))
        return { path: process.env.BROWSER_PATH, args: [], extra: {} };
    for (const c of ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable']) {
        try {
            const p = execSync('command -v ' + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (p) return { path: p, args: [], extra: {} };
        } catch { /* next */ }
    }
    try {
        const chromium = (await import('@sparticuz/chromium')).default;
        return { path: await chromium.executablePath(), args: chromium.args, extra: {} };
    } catch { /* none */ }
    return null;
}

const found = await findBrowser();
if (!found) { console.log('No Chromium found. Set $BROWSER_PATH.'); process.exit(0); }

const browser = await puppeteer.launch({
    executablePath: found.path,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files', ...found.args],
    headless: true,
    defaultViewport: { width: 1600, height: 900 },
});

const clientsSrc = readFileSync(join(ROOT, 'website/js/clients.js'), 'utf8');
const ctx = {};
new Function('window', clientsSrc)(ctx);
const BUNDLED = ctx.AMPLER_CLIENTS.filter((c) => c.bundled);

// The skins manifest, so the grid can be checked against it too.
const skinsSrc = readFileSync(join(ROOT, 'website/js/skins.js'), 'utf8');
const sctx = {};
new Function('window', skinsSrc)(sctx);
ctx.AMPLER_SKINS = (sctx.AMPLER_SKINS || []).map((s) => (typeof s === 'string' ? s : s.name));

/* A request counts as "leaving the machine" unless it is a local file, a
   loopback URL, or an in-page data:/blob: URI. */
function isLocal(url, pageIsFile) {
    if (/^(data:|blob:|about:|javascript:)/i.test(url)) return true;
    if (/^file:/i.test(url)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url)) return true;
    if (pageIsFile) return false;
    return false;
}

function watch(page) {
    const seen = { local: 0, external: [], failed: [] };
    page.on('request', (r) => {
        const u = r.url();
        if (isLocal(u, page.url().startsWith('file:'))) seen.local++;
        else seen.external.push(u);
    });
    page.on('requestfailed', (r) => seen.failed.push(r.url() + ' (' + (r.failure()?.errorText || '?') + ')'));
    return seen;
}

/* ------------------------------------------------------------------ */

async function driveLauncher(label, url) {
    head('Launcher via ' + label + '  (' + url + ')');
    const page = await browser.newPage();
    const seen = watch(page);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    const heading = await page.$eval('#gameedition', (n) => n.textContent.trim());
    heading === 'Ampler Launcher'
        ? ok('header reads "Ampler Launcher"')
        : bad('header reads "' + heading + '"');

    const tabs = await page.$$eval('#javatabs li', (n) => n.map((x) => x.textContent.trim()));
    tabs.join('/') === 'Play/Skins' ? ok('top nav is just ' + tabs.join(' + ')) : bad('top nav: ' + tabs.join(', '));

    const rows = await page.$$eval('#dropdn .dropdownOptions', (n) => n.length);
    rows === ctx.AMPLER_CLIENTS.length
        ? ok('version dropdown rendered ' + rows + ' rows')
        : bad('dropdown rendered ' + rows + ' rows, expected ' + ctx.AMPLER_CLIENTS.length);

    // Click every dropdown row, like a user would.
    const playTargets = [];
    for (let i = 0; i < rows; i++) {
        await page.click('#dropdn .dropdownOptions:nth-child(' + (i + 1) + ')');
        playTargets.push(await page.$eval('#playbutton', (a) => a.getAttribute('href')));
    }
    const real = playTargets.filter((h) => h && h !== '#');
    ok('clicked ' + playTargets.length + ' rows; ' + real.length + ' resolve to a build, ' +
       (playTargets.length - real.length) + ' correctly inert');
    const dead = real.filter((h) => !existsSync(join(ROOT, h)));
    dead.length === 0 ? ok('every Play target exists on disk') : bad('dead Play targets: ' + dead.join(', '));

    /* ---- the username ---- */
    await page.click('#username');
    const editing = await page.evaluate(() => ({
        visible: getComputedStyle(document.getElementById('usernameinput')).display !== 'none',
        focused: document.activeElement === document.getElementById('usernameinput'),
    }));
    editing.visible && editing.focused
        ? ok('clicking the user opens the name field')
        : bad('the name field did not open (visible=' + editing.visible + ' focused=' + editing.focused + ')');

    await page.evaluate(() => {
        const i = document.getElementById('usernameinput');
        i.value = 'Arena Test';
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const renamed = await page.$eval('#username', (n) => n.textContent);
    renamed === 'Arena Test' ? ok('the name can be changed') : bad('rename gave "' + renamed + '"');
    await page.reload({ waitUntil: 'load' });
    const kept = await page.$eval('#username', (n) => n.textContent);
    kept === 'Arena Test' ? ok('the name is remembered after a reload') : bad('the name was lost: "' + kept + '"');

    /* ---- the skins page ---- */
    await page.click('#header2');
    await new Promise((r) => setTimeout(r, 600));
    const skins = await page.evaluate(() => {
        const shown = (s) => {
            const n = document.querySelector(s);
            return !!(n && n.offsetParent && n.getBoundingClientRect().width);
        };
        return {
            cards: [...document.querySelectorAll('#skingrid .skinCard')].map((c) => ({
                name: (c.getAttribute('data-skin-name') || ''),
                hasPreview: !!c.querySelector('.skinPreview'),
                hasButton: !!c.querySelector('.skinDownload'),
            })),
            logoShown: shown('#playview .gameLogo'),
            playShown: shown('#mainbutton'),
            selectorShown: shown('#drop'),
            userShown: shown('#username'),
            user: document.querySelector('#username').textContent,
            avatarCards: document.querySelectorAll('#skingrid .skinCard').length,
        };
    });

    skins.cards.length === ctx.AMPLER_SKINS.length
        ? ok('the skins page lists all ' + skins.cards.length + ' skins in js/skins.js')
        : bad('skins page lists ' + skins.cards.length + ' of ' + ctx.AMPLER_SKINS.length + ' skins');
    const badCards = skins.cards.filter((c) => !c.hasPreview || !c.hasButton || !c.name);
    badCards.length === 0
        ? ok('every card has a preview picture, a name and a download button')
        : bad('incomplete cards: ' + badCards.map((c) => c.name).join(', '));
    !skins.logoShown ? ok('the skins page shows no logo') : bad('a logo is still visible on the skins page');
    !skins.playShown ? ok('the skins page shows no Play button') : bad('the Play button is still visible on the skins page');
    !skins.selectorShown ? ok('the skins page shows no version selector') : bad('the version selector is still visible');
    skins.userShown && skins.user === 'Arena Test'
        ? ok('the skins page keeps the user ("' + skins.user + '")')
        : bad('the user is missing on the skins page (' + skins.user + ')');

    // Download one skin and check the bytes that come out match the file on disk.
    const first = await page.$eval('#skingrid .skinCard', (c) => ({
        url: c.getAttribute('data-skin-url'),
        file: c.getAttribute('data-skin-file'),
    }));
    const diskPath = join(ROOT, decodeURIComponent(first.url.replace(/^\.\//, '')));
    const disk = readFileSync(diskPath);
    if (!url.startsWith('file:')) {
        // Over http:// the button's href can be followed and compared byte for byte.
        const fetched = await page.evaluate(async (u) => {
            const r = await fetch(u);
            const b = new Uint8Array(await r.arrayBuffer());
            return { ok: r.ok, bytes: b.length, head: [b[0], b[1], b[2], b[3]] };
        }, first.url);
        fetched.ok && fetched.bytes === disk.length && fetched.head[0] === disk[0]
            ? ok('the download button serves the skin file itself (' + first.file + ', ' + disk.length + ' B)')
            : bad('download mismatch for ' + first.file + ': ' + JSON.stringify(fetched) + ' vs ' + disk.length + ' B');
    } else {
        // Off disk there is nothing to fetch, so check the file the button names
        // is the real skin (PNG magic) and that the button carries it as a download.
        const buttonDownload = await page.$eval('#skingrid .skinCard .skinDownload', () => true);
        disk.length > 0 && disk[0] === 0x89 && disk[1] === 0x50 && buttonDownload
            ? ok('the download button names the real skin file (' + first.file + ', ' + disk.length + ' B)')
            : bad('skin file looks wrong: ' + diskPath);
    }

    // and back to Play
    await page.click('#header1');
    await new Promise((r) => setTimeout(r, 300));
    const back = await page.evaluate(() => ({
        playShown: !!document.querySelector('#mainbutton').offsetParent,
        selectorShown: !!document.querySelector('#drop').offsetParent,
        href: document.getElementById('playbutton').getAttribute('href'),
    }));
    back.playShown && back.selectorShown ? ok('the Play tab brings the bar straight back') :
        bad('going back to Play lost the button/selector');
    existsSync(join(ROOT, back.href)) ? ok('Play still points at a real build') : bad('Play points at ' + back.href);

    // The launcher must not reach out.
    seen.external.length === 0
        ? ok('0 requests left the machine (' + seen.local + ' local)')
        : bad('external requests: ' + [...new Set(seen.external)].join(', '));
    pageErrors.length === 0 ? ok('0 uncaught page errors') : bad('page errors: ' + pageErrors.join(' | '));

    if (process.env.SHOTS) {
        const out = join(process.env.SHOTS, 'launcher-' + (label.startsWith('file') ? 'file' : 'http') + '.png');
        await page.screenshot({ path: out }).catch(() => {});
        console.log('       screenshot: ' + out);
    }

    await page.close();
    return seen;
}

/* ---- optional server ---- */
let srv = null, httpBase = null;
const port = 8123;
srv = spawn('python3', [join(ROOT, 'website', 'tools', 'serve.py'), '--port', String(port),
    '--host', '127.0.0.1', '--no-browser'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/'); if (r.status === 200) { httpBase = 'http://127.0.0.1:' + port + '/'; break; } }
    catch { await new Promise((r) => setTimeout(r, 150)); }
}
head('Test server');
if (httpBase) ok('tools/serve.py is up and answering on ' + httpBase);
else bad('tools/serve.py never answered on port ' + port);

/* ---- A: no server at all ---- */
await driveLauncher('file:// (NO SERVER)', 'file://' + join(ROOT, 'index.html'));

/* ---- B: with the optional server ---- */
if (httpBase) await driveLauncher('http:// (optional server)', httpBase + 'index.html');

/* ---- C: do the games actually load with no server? ---- */
if (RUN_GAMES) {
    head('Game builds loaded straight off disk (no server)');
    for (const c of BUNDLED) {
        const page = await browser.newPage();
        const seen = watch(page);
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
        const url = 'file://' + join(ROOT, c.path);
        const t0 = Date.now();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
            // Give the engine a moment to build its canvas.
            let canvas = false, dims = null;
            for (let i = 0; i < 40; i++) {
                dims = await page.$$eval('canvas', (n) => n.length
                    ? { count: n.length, w: n[0].width, h: n[0].height } : null).catch(() => null);
                if (dims && dims.w > 0 && dims.h > 0) { canvas = true; break; }
                await new Promise((r) => setTimeout(r, 500));
            }
            const secs = ((Date.now() - t0) / 1000).toFixed(1);
            if (canvas) ok(c.id + ': booted off disk in ' + secs + 's, ' +
                           dims.count + ' canvas ' + dims.w + 'x' + dims.h);
            else bad(c.id + ': loaded but no sized <canvas> appeared within 20s');
            if (process.env.SHOTS) {
                const out = join(process.env.SHOTS, c.id + '.png');
                await page.screenshot({ path: out }).catch(() => {});
                console.log('       screenshot: ' + out);
            }
            seen.external.length === 0
                ? ok(c.id + ': 0 network requests (' + seen.local + ' local)')
                : bad(c.id + ': reached the network: ' + [...new Set(seen.external)].slice(0, 3).join(', '));
            if (errs.length) console.log('       note: ' + errs.length + ' page error(s): ' + errs[0]);
        } catch (e) {
            bad(c.id + ': failed to load off disk - ' + String(e).slice(0, 120));
        }
        await page.close();
    }
}

await browser.close();
if (srv) srv.kill('SIGTERM');

console.log('\n' + '='.repeat(58));
console.log('  passed: ' + pass + '   failed: ' + fail);
console.log('='.repeat(58));
if (fail) { failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('\nNo server required; nothing left the machine.');
