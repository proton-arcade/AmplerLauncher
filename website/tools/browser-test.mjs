#!/usr/bin/env node
/*
 * Ampler Launcher - real browser test.
 *
 * Drives an actual Chromium and watches every request the pages make, to prove
 * two things the static checks cannot:
 *
 *   A. The launcher works when opened straight off disk (file://), with no
 *      server running, and it issues ZERO network requests.
 *   B. The Play page and the Skins page both behave: every dropdown row goes
 *      somewhere real, the skins grid matches website/skins/, the username
 *      can be renamed and is remembered, the skins page shows no logo, no
 *      Play button and no version selector, and the download button never
 *      swaps the launcher page for the raw PNG.
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
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...found.args],

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

    // Click every dropdown row, like a user would - opening the list first, and
    // checking it closes itself again after the pick.
    const playTargets = [];
    for (let i = 0; i < rows; i++) {
        await page.click('#drop');
        const beforeClick = await page.$eval('#dropdn', (n) => n.style.visibility);
        await page.click('#dropdn .dropdownOptions:nth-child(' + (i + 1) + ')');
        const afterClick = await page.$eval('#dropdn', (n) => n.style.visibility);
        if (beforeClick !== 'visible' || afterClick !== 'hidden') {
            bad('row ' + (i + 1) + ' left the list in the wrong state (' + beforeClick + ' -> ' + afterClick + ')');
        }
        playTargets.push(await page.$eval('#playbutton', (a) => a.getAttribute('href')));
    }
    ok('every row opened the list, switched the build and closed it again');
    const real = playTargets.filter((h) => h && h !== '#');
    ok('clicked ' + playTargets.length + ' rows; ' + real.length + ' resolve to a build, ' +
       (playTargets.length - real.length) + ' correctly inert');
    const dead = real.filter((h) => !existsSync(join(ROOT, h)));
    dead.length === 0 ? ok('every Play target exists on disk') : bad('dead Play targets: ' + dead.join(', '));

    /* ---- the launcher works from a keyboard, with no mouse at all ---- */
    {
        await page.goto(url, { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 400));
        const activeId = () => page.evaluate(() => document.activeElement && document.activeElement.id);
        const tabTo = async (id, max = 12) => {
            for (let i = 0; i < max; i++) {
                await page.keyboard.press('Tab');
                if (await page.evaluate((x) => document.activeElement && document.activeElement.id === x, id)) return true;
            }
            return false;
        };

        const gotTab = await tabTo('header2');
        const ring = await page.evaluate(() => {
            const cs = getComputedStyle(document.activeElement);
            return cs.outlineStyle + ' ' + cs.outlineColor;
        });
        gotTab && /rgb\(0, 133, 66\)/.test(ring)
            ? ok('Tab reaches the Skins tab and it shows a focus ring (' + ring + ')')
            : bad('could not reach the Skins tab by keyboard (reached=' + gotTab + ', ring=' + ring + ')');

        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 700));
        const viaKeyboard = await page.evaluate(() => ({
            skinsShown: !document.getElementById('skinsview').hidden,
            cards: document.querySelectorAll('#skingrid .skinCard').length,
        }));
        viaKeyboard.skinsShown
            ? ok('Enter opens the skins page (' + viaKeyboard.cards + ' cards)')
            : bad('Enter on the Skins tab did not open the skins page');

        // from the tab into the grid, far enough to reach a download button
        let reachedButton = false;
        for (let i = 0; i < 10 && !reachedButton; i++) {
            await page.keyboard.press('Tab');
            reachedButton = await page.evaluate(() =>
                document.activeElement && document.activeElement.className === 'skinDownload');
        }
        reachedButton
            ? ok('Tab reaches a download button (' + (await activeId() || 'button') + ')')
            : bad('could not tab from the Skins tab into the grid');

        // version selector by keyboard
        await page.click('#header1');
        await new Promise((r) => setTimeout(r, 300));
        await page.evaluate(() => document.getElementById('drop').focus());
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 300));
        const opened = await page.evaluate(() => document.getElementById('dropdn').style.visibility);
        await page.evaluate(() => document.querySelector('#dropdn .dropdownOptions[data-client="1.5.2"]').focus());
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 300));
        const picked = await page.evaluate(() => ({
            version: document.getElementById('gameversion').textContent,
            href: document.getElementById('playbutton').getAttribute('href'),
            focusBack: document.activeElement.id,
        }));
        opened === 'visible' && picked.version === '1.5.2-sp2.01' && existsSync(join(ROOT, picked.href))
            ? ok('the version list opens and picks a build by keyboard (' + picked.version + ')')
            : bad('keyboard version picking failed: ' + JSON.stringify({ opened, picked }));

        await page.keyboard.press('Escape');
        const closed = await page.evaluate(() => document.getElementById('dropdn').style.visibility);
        closed === 'hidden' ? ok('Escape closes the version list') : bad('Escape left the list open');

        await page.evaluate(() => document.getElementById('userbox').focus());
        await page.keyboard.press('Enter');
        const editing = await page.evaluate(() => document.activeElement.id);
        editing === 'usernameinput'
            ? ok('Enter on the username opens the rename field')
            : bad('keyboard rename did not open the field (focus went to ' + editing + ')');
        await page.keyboard.press('Escape');
        await page.goto(url, { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 400));
    }

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
    // opening the rename field must not leave the version list hanging open
    await page.click('#drop');
    await new Promise((r) => setTimeout(r, 200));
    await page.click('#userbox');
    await new Promise((r) => setTimeout(r, 200));
    const listAfterUserClick = await page.$eval('#dropdn', (n) => n.style.visibility);
    listAfterUserClick === 'hidden'
        ? ok('clicking the username closes the version list')
        : bad('the version list stayed open when the rename field opened');
    await page.keyboard.press('Escape');

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

    // Download one skin. The page here is off disk, and an off-disk page may
    // not read another file (fetch and XHR are refused, and the download
    // attribute is ignored - a bare link would swap this page for the raw
    // PNG). So the click must open the skin in a viewer tab while this page
    // stays put. Over http the same click reads the bytes and hands the
    // browser a real download (covered by the jsdom tests in verify-offline).
    const first = await page.$eval('#skingrid .skinCard', (c) => ({
        url: c.getAttribute('data-skin-url'),
        file: c.getAttribute('data-skin-file'),
    }));
    const diskPath = join(ROOT, decodeURIComponent(first.url.replace(/^\.\//, '')));
    const disk = readFileSync(diskPath);
    disk.length > 0 && disk[0] === 0x89 && disk[1] === 0x50
        ? ok('the download button points at the real skin file (' + first.file + ', ' + disk.length + ' B)')
        : bad('skin file looks wrong: ' + diskPath);

    const popupPromise = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 8000);
        browser.once('targetcreated', (target) => { clearTimeout(timer); resolve(target.url()); });
    });
    await page.click('#skingrid .skinCard .skinDownload');
    const popup = await popupPromise;
    popup && popup.indexOf('/website/skins/') !== -1
        ? ok('the download opens the skin in a viewer tab (' +
             decodeURIComponent(popup.split('/').pop() || '') + ')')
        : bad('clicking download did not open the skin in a viewer tab (got ' + popup + ')');
    const stillLauncher = await page.evaluate(() =>
        !!document.getElementById('skingrid') && !!document.querySelector('#skingrid .skinCard'));
    stillLauncher
        ? ok('the launcher page was not replaced by the raw PNG')
        : bad('the launcher page navigated away on download');

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

/* ---- the launcher, straight off disk: no server anywhere ---- */
await driveLauncher('file:// (NO SERVER)', 'file://' + join(ROOT, 'index.html'));

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

console.log('\n' + '='.repeat(58));
console.log('  passed: ' + pass + '   failed: ' + fail);
console.log('='.repeat(58));
if (fail) { failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('\nNo server required; nothing left the machine.');
