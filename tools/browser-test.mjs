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
 *   C. Each bundled game build actually loads and starts under file://.
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

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
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

const clientsSrc = readFileSync(join(ROOT, 'js/clients.js'), 'utf8');
const ctx = {};
new Function('window', clientsSrc)(ctx);
const BUNDLED = ctx.AMPLER_CLIENTS.filter((c) => c.bundled);

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

    const rows = await page.$$eval('#dropdn .dropdownOptions', (n) => n.length);
    const expectedAtBoot = ctx.AMPLER_CLIENTS.filter((c) => c.category === 'web').length;
    rows === expectedAtBoot
        ? ok('version dropdown rendered ' + rows + ' rows for the default "web" category')
        : bad('dropdown rendered ' + rows + ' rows, expected ' + expectedAtBoot);

    const heading = await page.$eval('#gameedition', (n) => n.textContent);
    ok('booted into "' + heading.trim() + '"');

    // Click every sidebar tab and every dropdown row, like a user would.
    let playTargets = [];
    for (const tab of ['gtabs2', 'gtabs3', 'gtabs4']) {
        await page.click('#' + tab);
        const n = await page.$$eval('#dropdn .dropdownOptions', (x) => x.length);
        for (let i = 0; i < n; i++) {
            await page.click('#dropdn .dropdownOptions:nth-child(' + (i + 1) + ')');
            playTargets.push(await page.$eval('#playbutton', (a) => a.getAttribute('href')));
        }
    }
    const real = playTargets.filter((h) => h && h !== '#');
    ok('clicked 3 tabs / ' + playTargets.length + ' rows; ' + real.length +
       ' resolve to a build, ' + (playTargets.length - real.length) + ' correctly inert');

    const dead = real.filter((h) => !existsSync(join(ROOT, h)));
    dead.length === 0 ? ok('every Play target exists on disk') : bad('dead Play targets: ' + dead.join(', '));

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
srv = spawn('python3', [join(ROOT, 'tools/serve.py'), '--port', String(port),
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
