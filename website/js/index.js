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
 * is the way to run this. There is no server in this launcher: everything on
 * the page works from the file system alone. See README.md.
 */

var SVG_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>';
var SVG_UP = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dropdownIcon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>';

var STORE_KEY = 'ampler.offline.v2';
var COOKIE_KEY = 'ampler.offline.v2';
var COOKIE_MAX_AGE = 365 * 24 * 60 * 60;   // one year, in seconds
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

// Settings persistence - the name and the last version you picked are kept
// in every place the browser allows, and read back from the first place
// that has anything:
//
//   1. local storage - the normal place, used whenever the page has it;
//   2. a cookie with a year-long expiry - some browsers refuse local
//      storage to a page opened straight off disk but still keep its
//      cookies, and the expiry date is what makes it survive the browser
//      closing (a session cookie would not);
//   3. js/user.js - a file always survives; put your name there once and
//      every boot starts with it.
//
// On a browser that keeps neither storage nor cookies, the launcher still
// works - js/user.js is the name that shows. Game worlds are unaffected -
// those are handled by the game build itself, not by the launcher.
function readCookie(name) {
    try {
        var parts = document.cookie ? document.cookie.split(';') : [];
        for (var i = 0; i < parts.length; i++) {
            var kv = parts[i].replace(/^\s+/, '');
            var eq = kv.indexOf('=');
            if (eq > 0 && kv.slice(0, eq) === name) {
                return decodeURIComponent(kv.slice(eq + 1));
            }
        }
    } catch (e) { /* cookies unavailable */ }
    return null;
}

function loadStore() {
    var raw = null;
    try {
        raw = window.localStorage.getItem(STORE_KEY);
    } catch (e) { /* opaque origin / private mode / storage disabled */ }
    if (!raw) raw = readCookie(COOKIE_KEY);
    if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* corrupt - ignore */ }
    }
    return {};
}

function saveStore(patch) {
    var cur = loadStore();
    for (var k in patch) cur[k] = patch[k];
    var text = JSON.stringify(cur);
    try {
        window.localStorage.setItem(STORE_KEY, text);
    } catch (e) { /* storage refused - the cookie may still take it */ }
    try {
        document.cookie = COOKIE_KEY + '=' + encodeURIComponent(text) +
            '; expires=' + new Date(Date.now() + COOKIE_MAX_AGE * 1000).toUTCString() +
            '; path=/';
    } catch (e) { /* cookies refused - storage may still have it */ }
}

/* The bar is made of divs and list items, which a keyboard cannot reach on its
   own. Every control that has a click handler gets this too, so Tab + Enter (or
   Space) does what the mouse does. Events from children are ignored: that keeps
   a space typed inside the username field a space. */
function activateOnKey(node, action) {
    if (!node) return;
    node.addEventListener('keydown', function (event) {
        if (event.target !== node) return;
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        action(event);
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
    el('header1').setAttribute('aria-selected', skins ? 'false' : 'true');
    el('header2').setAttribute('aria-selected', skins ? 'true' : 'false');
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
    // the first one in the DOM sits highest (see stackDropdownRows).
    list.forEach(function (client, index) {
        var row = document.createElement('div');
        row.className = 'dropdownOptions dropdown-' + client.id;
        row.style.opacity = client.bundled ? '1' : '0.55';
        row.setAttribute('data-client', client.id);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.tabIndex = 0;
        row.onclick = function () {
            selectClient(client.id);
            closeDropdown();
        };
        activateOnKey(row, function () {
            selectClient(client.id);
            closeDropdown();
        });
        row.innerHTML =
            '<div class="dropdownOption">' +
                '<div class="centeredIcon"><img src="' + escapeHtml(client.icon) + '" alt=""></div>' +
                '<div class="dropdownOptionText">' +
                    '<p class="bolded">' + escapeHtml(client.title) + '</p>' +
                    '<p>' + escapeHtml(client.version) + '</p>' +
                '</div>' +
            '</div>';
        menu.appendChild(row);
    });

    stackDropdownRows();
}

// Rows tile upward from the bar, offset by the height the stylesheet actually
// gave them, so the list stays tight at any window size. The height is
// measured rather than assumed; if it cannot be measured (jsdom, or a
// display:none page) it falls back to the 5vw the design asks for.
// Runs again whenever the list opens and whenever the window changes size, so
// a resize never leaves the rows stacked at their old height.
function stackDropdownRows() {
    var menu = el('dropdn');
    if (!menu) return;
    var rows = menu.children;
    if (!rows.length) return;
    var step = rows[0].getBoundingClientRect
        ? rows[0].getBoundingClientRect().height
        : 0;
    for (var i = 0; i < rows.length; i++) {
        var offset = rows.length - 1 - i;
        rows[i].style.bottom = step > 0 ? (offset * step) + 'px' : (offset * 5) + 'vw';
    }
}

function selectClient(id, silent) {
    var client = clientById(id);
    if (!client) return;

    state.clientId = id;
    Array.prototype.forEach.call(el('dropdn').children, function (row) {
        row.setAttribute('aria-selected', row.getAttribute('data-client') === id ? 'true' : 'false');
    });
    el('gametitle').innerHTML = escapeHtml(client.title);
    el('gameversion').innerHTML = escapeHtml(client.version);
    el('gameicon').src = client.icon;

    var button = el('playbutton');
    if (client.bundled) {
        button.href = client.path;
        button.style.cursor = 'pointer';
        button.onclick = null;
    } else {
        // Never hand back a URL that 404s. The build is not in this copy of
        // the launcher, so the button refuses the click - the not-allowed
        // cursor is the whole message, there are no popups here.
        button.href = '#';
        button.style.cursor = 'not-allowed';
        button.onclick = function (event) { event.preventDefault(); };
    }

    if (!silent) saveStore({ clientId: id });
}

function dropdowntoggle() {
    var menu = el('dropdn');
    if (menu.style.visibility === 'hidden') openDropdown();
    else closeDropdown();
}

function openDropdown() {
    stackDropdownRows();
    el('dropdn').style.visibility = 'visible';
    el('dropdownuparrow').innerHTML = SVG_UP;
    el('drop').setAttribute('aria-expanded', 'true');
}

function closeDropdown() {
    var menu = el('dropdn');
    if (menu) menu.style.visibility = 'hidden';
    var arrow = el('dropdownuparrow');
    if (arrow) arrow.innerHTML = SVG_DOWN;
    var drop = el('drop');
    if (drop) {
        drop.setAttribute('aria-expanded', 'false');
        // if the keyboard was inside the list, do not leave focus stranded on a
        // row that is no longer rendered
        if (menu && menu.contains(document.activeElement)) drop.focus();
    }
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
 * Saving the name into js/user.js
 *
 * Storage and cookies are wherever the browser allows, and some browsers
 * drop both for a page opened off disk. The file is the one place that
 * always survives - but no page may write a file quietly, so this asks:
 * a native Save dialog opens, you pick website/js/user.js, and its code
 * is replaced with the name as it stands. Browsers without the file
 * system API (Firefox, Safari) fall back to copying the one line, ready
 * to paste into the file by hand.
 * ------------------------------------------------------------------ */

function userFileText(name) {
    return "// ===================================================================\n" +
        "//  YOUR USERNAME - set by the launcher's save button on " +
        new Date().toISOString().slice(0, 10) + "\n" +
        "//  Change the name between the quotes (keep the quotes), save, and\n" +
        "//  reload the launcher. This is the name that ALWAYS comes back, in\n" +
        "//  every browser, because it is a file.\n" +
        "// ===================================================================\n\n" +
        "window.AMPLER_USER = " + JSON.stringify(name) + ";\n";
}

async function saveUserToFile() {
    var name = state.username;
    var text = userFileText(name);

    if (typeof window.showSaveFilePicker === 'function') {
        try {
            var handle = await window.showSaveFilePicker({
                suggestedName: 'user.js',
                types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
            });
            var writable = await handle.createWritable();
            await writable.write(text);
            await writable.close();
            return 'saved';
        } catch (e) {
            if (e && e.name === 'AbortError') return 'cancelled';   // dialog closed
            // fall through to the clipboard copy
        }
    }

    try {
        await navigator.clipboard.writeText("window.AMPLER_USER = " + JSON.stringify(name) + ";");
        return 'copied';
    } catch (e) { /* no clipboard either - nothing to do */ }
    return 'failed';
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function init() {
    el('dropdownuparrow').innerHTML = SVG_DOWN;

    var saved = loadStore();
    // First choice: the name this browser remembers. Then the one set in
    // js/user.js (a file always survives). Then the stock default.
    setUsername(saved.username || window.AMPLER_USER || DEFAULT_USER, false);

    buildDropdown();

    var start = clientById(saved.clientId) || clients()[0];
    if (start) selectClient(start.id, true);

    // Keyboard: the two tabs, the version selector and the username.
    activateOnKey(el('header1'), function () { showView('play'); });
    activateOnKey(el('header2'), function () { showView('skins'); });
    activateOnKey(el('drop'), function () { dropdowntoggle(); });
    activateOnKey(el('userbox'), function () { editUser(); });

    // "save this name into user.js": the click must not open the rename
    // field on the way through, and Enter/Space on the button writes.
    el('usersave').addEventListener('click', function (event) {
        event.stopPropagation();
        closeDropdown();
        saveUserToFile();
    });
    activateOnKey(el('usersave'), function (event) {
        event.stopPropagation();
        saveUserToFile();
    });

    // The rows are offset in px from their measured height, so a resize
    // needs them measured again.
    window.addEventListener('resize', stackDropdownRows);

    // Escape closes the version list, wherever the focus happens to be.
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && el('dropdn').style.visibility === 'visible') {
            closeDropdown();
        }
    });

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
