/*
 * Ampler Launcher v2.0.00-offline
 *
 * Rewritten so the launcher has no network dependency and no dead links:
 *
 *  - the version dropdown is generated from js/clients.js instead of thirteen
 *    hand-written <div>s, so what you see is what is actually on disk;
 *  - entries that are not bundled say so instead of navigating to a folder
 *    that does not exist;
 *  - Google Fonts is gone (see css/fonts.css);
 *  - the Discord button opens in a new tab rather than navigating the launcher
 *    away, so a dead link offline costs you nothing.
 *
 * Runs from http://localhost (recommended) and degrades gracefully from file://.
 */

var SVG_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>';
var SVG_UP = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>';

var STORE_KEY = 'ampler.offline.v2';

var state = {
    category: 'web',
    clientId: null
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function el(id) {
    return document.getElementById(id);
}

function clientsIn(category) {
    return (window.AMPLER_CLIENTS || []).filter(function (c) {
        return c.category === category;
    });
}

function clientById(id) {
    return (window.AMPLER_CLIENTS || []).filter(function (c) {
        return c.id === id;
    })[0] || null;
}

function loadStore() {
    try {
        var raw = window.localStorage.getItem(STORE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* private mode / file:// with storage disabled */ }
    return {};
}

function saveStore(patch) {
    try {
        var cur = loadStore();
        for (var k in patch) cur[k] = patch[k];
        window.localStorage.setItem(STORE_KEY, JSON.stringify(cur));
    } catch (e) { /* non-fatal */ }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

var toastTimers = [];

function toast(title, body, colour) {
    var box = el('naerror');
    el('naerror-text').innerHTML = escapeHtml(body);
    box.querySelector('p.bolded').textContent = title;
    box.style.color = colour || 'gold';
    box.style.borderColor = colour || 'gold';
    box.classList.remove('zoom-out');
    box.style.display = 'block';

    toastTimers.forEach(clearTimeout);
    toastTimers = [];
    toastTimers.push(setTimeout(function () { box.classList.add('zoom-out'); }, 5200));
    toastTimers.push(setTimeout(function () {
        box.classList.remove('zoom-out');
        box.style.display = 'none';
    }, 5400));
}

function errorNA(msg) {
    toast('SORRY!', msg || "This feature hasn't been made yet.");
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

function resetSelected() {
    ['gtabs1', 'gtabs2', 'gtabs3', 'gtabs4', 'gtabs5', 'gtabs6'].forEach(function (id) {
        var n = el(id);
        if (n) { n.style.fontWeight = ''; n.style.borderLeft = ''; }
    });
    var menu = el('dropdn');
    if (menu) menu.style.visibility = 'hidden';
    var arrow = el('dropdownuparrow');
    if (arrow) arrow.innerHTML = SVG_DOWN;
}

function selectCategory(category) {
    var meta = (window.AMPLER_CATEGORIES || {})[category];
    if (!meta) return;

    state.category = category;
    resetSelected();

    el('game-bg').style.backgroundImage = 'url(' + meta.background + ')';
    el('game-header').src = meta.logo;
    el('gameedition').innerHTML = escapeHtml(meta.heading);

    var tab = el(meta.tab);
    if (tab) {
        tab.style.fontWeight = '700';
        tab.style.borderLeft = '#008542 solid 4px';
    }

    // Only the web edition has bundled content for the other top tabs to act on.
    el('header2').style.display = category === 'modded' ? 'block' : 'none';
    el('header5').style.display = category === 'web' ? 'block' : 'none';

    buildDropdown();

    var list = clientsIn(category);
    var firstBundled = list.filter(function (c) { return c.bundled; })[0] || list[0];
    if (firstBundled) selectClient(firstBundled.id, true);

    saveStore({ category: category });
}

/* ------------------------------------------------------------------ *
 * Dropdown
 * ------------------------------------------------------------------ */

function buildDropdown() {
    var menu = el('dropdn');
    var list = clientsIn(state.category);
    menu.innerHTML = '';

    // Items are absolutely positioned and stack upward from the selector, so
    // the first one in the DOM sits highest: bottom = (count-1-index) * 5vw.
    list.forEach(function (client, index) {
        var row = document.createElement('div');
        row.className = 'dropdownOptions dropdown-' + client.id;
        row.style.bottom = ((list.length - 1 - index) * 5) + 'vw';
        row.style.opacity = client.bundled ? '1' : '0.55';
        row.setAttribute('data-client', client.id);
        row.onclick = function () {
            selectClient(client.id);
            el('dropdn').style.visibility = 'hidden';
            el('dropdownuparrow').innerHTML = SVG_DOWN;
        };
        row.innerHTML =
            '<div class="dropdownOption">' +
                '<div class="centeredIcon"><img src="' + escapeHtml(client.icon) + '" style="width: 2.5vw;" alt=""></div>' +
                '<div class="dropdownOptionText">' +
                    '<p class="bolded">' + escapeHtml(client.title) + '</p>' +
                    '<p>' + escapeHtml(client.version) + '</p>' +
                '</div>' +
            '</div>';
        menu.appendChild(row);
    });
}

function selectClient(id, silent) {
    var client = clientById(id);
    if (!client) return;

    state.clientId = id;
    el('gametitle').innerHTML = escapeHtml(client.title);
    el('gameversion').innerHTML = escapeHtml(client.version);
    el('gameicon').src = client.icon;

    var button = el('playbutton');
    if (client.bundled) {
        button.href = client.path;
        button.style.cursor = 'pointer';
        button.onclick = null;
    } else {
        // Never hand back a URL that 404s. Intercept and explain instead.
        button.href = '#';
        button.style.cursor = 'not-allowed';
        button.onclick = function (event) {
            event.preventDefault();
            toast('NOT BUNDLED',
                client.title + ' is not included in the offline build. Drop a self-contained HTML build at ' +
                client.path + ' and set bundled:true for "' + client.id + '" in js/clients.js.',
                'goldenrod');
        };
    }

    if (!silent) saveStore({ clientId: id });
}

function dropdowntoggle() {
    var menu = el('dropdn');
    var arrow = el('dropdownuparrow');
    if (menu.style.visibility === 'hidden') {
        menu.style.visibility = 'visible';
        arrow.innerHTML = SVG_UP;
    } else {
        menu.style.visibility = 'hidden';
        arrow.innerHTML = SVG_DOWN;
    }
}

/* ------------------------------------------------------------------ *
 * Sidebar extras
 * ------------------------------------------------------------------ */

function openDiscord() {
    // External on purpose; opens in a tab so an unreachable network does not
    // strand the user away from the launcher.
    window.open('https://discord.gg/xuu8TnSY4b', '_blank', 'noopener');
}

function showCredits() {
    toast('CREDITS',
        'Ampler Launcher UI by irv77. Eaglercraft by lax1dude and contributors. ' +
        'Offline builds mirrored from cdn.eaglercraft.ru. Local server: EaglerXServer v1.1.1.',
        'gold');
}

function showOfflineStatus() {
    var bundled = clientsIn('web').filter(function (c) { return c.bundled; });
    var protocol = window.location.protocol === 'file:' ? 'file:// (limited)' : window.location.origin;
    toast('OFFLINE STATUS',
        bundled.length + ' of ' + (window.AMPLER_CLIENTS || []).length + ' clients bundled. Serving from ' + protocol +
        '. No external requests are made by this page.',
        '#7CFC98');
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function preventMotion(event) {
    window.scrollTo(0, 0);
    event.preventDefault();
    event.stopPropagation();
}

function init() {
    if (window.location.protocol === 'file:') {
        el('filewarning').style.display = 'block';
    }

    el('dropdownuparrow').innerHTML = SVG_DOWN;

    var saved = loadStore();
    if (saved.username) el('username').textContent = saved.username;

    var category = (window.AMPLER_CATEGORIES || {})[saved.category] ? saved.category : 'web';
    selectCategory(category);

    if (saved.clientId) {
        var c = clientById(saved.clientId);
        if (c && c.category === category) selectClient(saved.clientId, true);
    }
}

window.addEventListener('scroll', preventMotion, false);
window.addEventListener('touchmove', preventMotion, { passive: false });

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

console.clear();
