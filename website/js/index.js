/*
 * Ampler Launcher - launcher page.
 *
 * Full screen, two views: Play and Skins (top left). The bottom bar holds the
 * version selector, the Play button and the username; the username can be
 * clicked and renamed, and the name is remembered locally.
 *
 * No network dependency and no dead links:
 *
 *  - the version dropdown is generated from js/clients.js, so what you see is
 *    what is actually on disk;
 *  - entries that are not bundled say so instead of navigating to a folder
 *    that does not exist;
 *  - Google Fonts is gone (see css/fonts.css).
 *
 * The bundled builds are the official Eaglercraft "offline download" single
 * files, which are built to be opened directly - so double-clicking index.html
 * is a first-class way to run this, not a fallback. tools/serve.py stays
 * around only for the cases where a plain http:// origin genuinely helps
 * (SharedArrayBuffer for the WASM builds, or serving to another device on the
 * LAN). See README.md.
 */

var SVG_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>';
var SVG_UP = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>';

var STORE_KEY = 'ampler.offline.v2';
var DEFAULT_USER = 'Generic User';
var MAX_USER = 24;

var state = {
    clientId: null,
    view: 'play',
    username: DEFAULT_USER
};

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function el(id) {
    return document.getElementById(id);
}

function clients() {
    return window.AMPLER_CLIENTS || [];
}

function clientById(id) {
    return clients().filter(function (c) {
        return c.id === id;
    })[0] || null;
}

// Settings persistence. On a file:// origin the browser treats the page as an
// opaque origin and window.localStorage throws SecurityError, so this silently
// degrades: the launcher still works, it just will not remember your name or
// your last version between sessions. Game worlds are unaffected - those are
// handled by the game build itself, not by the launcher.
function loadStore() {
    try {
        var raw = window.localStorage.getItem(STORE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* opaque origin / private mode / storage disabled */ }
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

/* ------------------------------------------------------------------ *
 * Views - Play / Skins
 * ------------------------------------------------------------------ */

function showView(name) {
    var skins = name === 'skins';
    state.view = skins ? 'skins' : 'play';

    el('playview').hidden = skins;
    el('skinsview').hidden = !skins;

    // The selected tab in the header, and the bar that matches it.
    el('header1').className = skins ? 'headerButtons' : 'headerButtonSelected';
    el('header2').className = skins ? 'headerButtonSelected' : 'headerButtons';
    el('mainPage').classList.toggle('skinsMode', skins);

    closeDropdown();

    if (skins && typeof renderSkins === 'function') renderSkins();
}

/* ------------------------------------------------------------------ *
 * Version dropdown
 * ------------------------------------------------------------------ */

function buildDropdown() {
    var menu = el('dropdn');
    var list = clients();
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
            closeDropdown();
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
    if (menu.style.visibility === 'hidden') openDropdown();
    else closeDropdown();
}

function openDropdown() {
    el('dropdn').style.visibility = 'visible';
    el('dropdownuparrow').innerHTML = SVG_UP;
}

function closeDropdown() {
    var menu = el('dropdn');
    if (menu) menu.style.visibility = 'hidden';
    var arrow = el('dropdownuparrow');
    if (arrow) arrow.innerHTML = SVG_DOWN;
}

/* ------------------------------------------------------------------ *
 * Username - click it, type a name, press Enter. Saved locally.
 * ------------------------------------------------------------------ */

function cleanUser(name) {
    var s = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (s.length > MAX_USER) s = s.slice(0, MAX_USER).trim();
    return s || DEFAULT_USER;
}

function setUsername(name, save) {
    var clean = cleanUser(name);
    state.username = clean;
    el('username').textContent = clean;
    el('usernameinput').value = clean;
    if (save) saveStore({ username: clean });
    return clean;
}

function editUser() {
    var box = el('userbox');
    var input = el('usernameinput');
    if (box.classList.contains('usernameEditing')) return;

    box.classList.add('usernameEditing');
    input.value = state.username;
    input.focus();
    input.select();
}

function commitUser() {
    var box = el('userbox');
    var input = el('usernameinput');
    if (!box.classList.contains('usernameEditing')) return;
    box.classList.remove('usernameEditing');
    setUsername(input.value, true);
}

function cancelUser() {
    var box = el('userbox');
    var input = el('usernameinput');
    if (!box.classList.contains('usernameEditing')) return;
    box.classList.remove('usernameEditing');
    input.value = state.username;
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function init() {
    el('dropdownuparrow').innerHTML = SVG_DOWN;

    var saved = loadStore();
    setUsername(saved.username || DEFAULT_USER, false);

    buildDropdown();

    var start = clientById(saved.clientId) || clients()[0];
    if (start) selectClient(start.id, true);

    // Username editing
    var input = el('usernameinput');
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); commitUser(); }
        else if (event.key === 'Escape') { event.preventDefault(); cancelUser(); }
    });
    input.addEventListener('blur', commitUser);

    // Clicking anywhere outside the selector closes the version dropdown - the
    // username included, so opening the rename field tidies the bar up.
    document.addEventListener('click', function (event) {
        var node = event.target;
        while (node) {
            if (node.id === 'drop' || node.id === 'dropdn') return;
            node = node.parentNode;
        }
        closeDropdown();
    });

    // Nothing in the bar should be selectable, but the username field is.
    document.querySelectorAll('.gameSelection').forEach(function (n) {
        n.addEventListener('selectstart', function (event) {
            if (event.target && event.target.id === 'usernameinput') return;
            event.preventDefault();
        });
    });

    showView('play');
}

// This file is loaded after the markup, so every node init() touches has
// already been parsed. Initialise immediately instead of queueing on
// DOMContentLoaded - that keeps boot deterministic, including when the page is
// opened straight off disk where readyState can still read "loading".
if (document.getElementById('dropdn')) {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}

console.clear();
