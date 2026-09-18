/*
 * Ampler Launcher - the Skins page.
 *
 * Reads js/skins.js (kept in step with website/skins/ by tools/bake-skins.py)
 * and lays the skins out as boxes over the same background the Play page
 * uses, small gap between them: the preview picture on top of the box, the
 * name in the bottom left and the download button in the bottom right.
 *
 * Zero setup:
 *   - a skin folder is all it takes (see js/skins.js for the layout);
 *   - if a folder has no preview file, the picture is drawn from the skin
 *     itself - head, body, arms and legs of the classic 64x64 layout;
 *   - the search box in the head row filters the grid as you type.
 *
 * Downloading hands the original skin file (.png) to the browser, exactly as
 * it sits on disk - nothing is re-encoded. See downloadSkin below for how.
 */

var SKIN_PREVIEW_COLUMNS = 16;
var SKIN_PREVIEW_ROWS = 32;
var SKIN_PREVIEW_SCALE = 16;

/* classic 64x64 skin sheet regions, in skin pixels */
var SKIN_REGIONS = [
    [8, 8, 8, 8, 4, 0],      // head front   -> top of the character
    [20, 20, 8, 12, 4, 8],   // body front
    [44, 20, 4, 12, 0, 8],   // right arm front
    [36, 52, 4, 12, 12, 8],  // left arm front
    [4, 20, 4, 12, 4, 20],   // right leg front
    [20, 52, 4, 12, 8, 20]   // left leg front
];

var skinsState = {
    library: [],
    built: false,
    filter: '',
    missing: {}   // names whose folder/file did not load - listed but deleted
};

function sg(id) {
    return document.getElementById(id);
}

/* ------------------------------------------------------------------ *
 * Building the library
 * ------------------------------------------------------------------ */

function stripExtension(name) {
    return String(name).replace(/\.[A-Za-z0-9]+$/, '');
}

function staticSkinEntry(name) {
    var dir = window.AMPLER_SKIN_DIR || './website/skins/';
    var prefix = window.AMPLER_SKIN_PREVIEW_PREFIX || 'preview.';
    var folder = dir + encodeURIComponent(name) + '/';
    var skinName = name + '.png';

    return {
        name: name,
        folder: folder,
        fileName: skinName,
        skinUrl: folder + encodeURIComponent(skinName),
        previewUrl: folder + encodeURIComponent(prefix + skinName)
    };
}

/* The library is the manifest (website/js/skins.js) plus whatever folders
   tools/bake-skins.py wrote into skins/list.js, in that order. A name is
   only ever added once. */
function buildLibrary() {
    var seen = {};

    function add(name) {
        if (!name || seen[name]) return;
        // never build a path out of anything that could climb out of skins/
        if (/[\\/]/.test(name) || name.indexOf('..') !== -1) return;
        seen[name] = true;
        skinsState.library.push(staticSkinEntry(name));
    }

    (window.AMPLER_SKINS || []).forEach(function (entry) {
        add(typeof entry === 'string' ? entry : entry.name);
    });
    (window.AMPLER_SKINS_FROM_DIR || []).forEach(add);
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function skinCard(entry) {
    var card = document.createElement('div');
    card.className = 'skinCard';
    card.setAttribute('data-skin-name', entry.name);
    card.setAttribute('data-skin-url', entry.skinUrl);
    card.setAttribute('data-skin-file', entry.fileName);

    var wrap = document.createElement('div');
    wrap.className = 'skinPreviewWrap';

    if (entry.previewUrl) {
        var img = document.createElement('img');
        img.className = 'skinPreview';
        img.alt = entry.name;
        img.draggable = false;
        // A missing preview file is normal - draw one from the skin instead.
        img.onerror = function () {
            img.remove();
            wrap.classList.add('skinCardMissing');
            drawSkinPreview(entry, wrap);
        };
        img.src = entry.previewUrl;
        wrap.appendChild(img);
    } else {
        wrap.classList.add('skinCardMissing');
        drawSkinPreview(entry, wrap);
    }

    var footer = document.createElement('div');
    footer.className = 'skinFooter';

    var label = document.createElement('p');
    label.className = 'skinName';
    label.textContent = entry.name;
    label.title = entry.fileName;

    var button = document.createElement('button');
    button.className = 'skinDownload';
    button.type = 'button';
    button.title = 'Download ' + entry.fileName;
    button.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />' +
        '<path d="M7 11l5 5l5 -5" />' +
        '<path d="M12 4l0 12" /></svg>';
    button.onclick = function (event) {
        downloadSkin(event, button);
    };

    footer.appendChild(label);
    footer.appendChild(button);
    card.appendChild(wrap);
    card.appendChild(footer);
    return card;
}

function renderSkins() {
    if (!skinsState.built) {
        buildLibrary();
        skinsState.built = true;
    }

    var grid = sg('skingrid');
    var query = skinsState.filter;

    grid.innerHTML = '';
    skinsState.library.forEach(function (entry) {
        if (skinsState.missing[entry.name]) return;
        if (query && entry.name.toLowerCase().indexOf(query) === -1) return;
        grid.appendChild(skinCard(entry));
    });

    updateSkinCount();
}

/* Keeps the "N skins" line, the empty panel and the grid in step. Counted from
   the cards that actually made it in, so a skin whose folder went away takes
   itself out of the numbers too. */
function updateSkinCount() {
    var grid = sg('skingrid');
    var visible = grid.children.length;
    var known = skinsState.library.filter(function (e) {
        return !skinsState.missing[e.name];
    }).length;

    sg('skinscount').textContent = known === 0 ? '' :
        (visible !== known ? visible + ' of ' + known + ' skins'
            : known + (known === 1 ? ' skin' : ' skins'));
    sg('skinempty').hidden = known !== 0;
    grid.hidden = known === 0;
}

/* A card whose skin AND preview both refuse to load is a folder that is no
   longer there (a stale name in js/skins.js). Take the card out instead of
   leaving a broken box with a download button that 404s. */
function dropMissingCard(wrap, name) {
    skinsState.missing[name] = true;
    var card = wrap.parentNode;
    if (card && card.parentNode) card.parentNode.removeChild(card);
    updateSkinCount();
}

function filterSkins(value) {
    skinsState.filter = String(value || '').trim().toLowerCase();
    renderSkins();
}

/* ------------------------------------------------------------------ *
 * Preview for folders that do not ship one: draw the front of the
 * character from the skin sheet itself.
 * ------------------------------------------------------------------ */

function drawSkinPreview(entry, wrap) {
    var probe = new Image();
    probe.onload = function () {
        var w = probe.naturalWidth;
        var h = probe.naturalHeight;
        // classic 64x64 and the 128x128 HD skins both work; everything else
        // falls back to the whole picture.
        var cell = 0;
        if (w >= 64 && h >= 64) cell = Math.floor(Math.min(w / 64, h / 64));

        if (!cell) {
            var img = document.createElement('img');
            img.className = 'skinPreview';
            img.draggable = false;
            img.src = entry.skinUrl;
            img.onerror = function () { dropMissingCard(wrap, entry.name); };
            wrap.appendChild(img);
            return;
        }

        var canvas = document.createElement('canvas');
        canvas.className = 'skinPreviewCanvas';
        canvas.width = SKIN_PREVIEW_COLUMNS * SKIN_PREVIEW_SCALE;
        canvas.height = SKIN_PREVIEW_ROWS * SKIN_PREVIEW_SCALE;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.setAttribute('data-cell', String(cell));
        ctx.imageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;

        var legacy = (h * 2 <= w); // 64x32 skins have no separate limb boxes
        var regions = legacy ? SKIN_REGIONS.slice(0, 2) : SKIN_REGIONS;

        regions.forEach(function (r) {
            ctx.drawImage(probe,
                r[0] * cell, r[1] * cell, r[2] * cell, r[3] * cell,
                r[4] * SKIN_PREVIEW_SCALE, r[5] * SKIN_PREVIEW_SCALE,
                r[2] * SKIN_PREVIEW_SCALE, r[3] * SKIN_PREVIEW_SCALE);
        });

        wrap.appendChild(canvas);
    };
    probe.onerror = function () { dropMissingCard(wrap, entry.name); };
    probe.src = entry.skinUrl;
}

/* ------------------------------------------------------------------ *
 * Download
 *
 * Clicking the button must put the skin .png in the browser's Downloads,
 * exactly as it sits in its folder - never swap this page for the raw
 * picture (what a bare link does once the browser declines to download).
 *
 * The one way a page can hand a file to the Downloads list is a link with
 * the download attribute pointing at bytes the page itself holds. So:
 *
 *   - over http(s) (a static host, a LAN, GitHub Pages, any server) the
 *     file is read with fetch() and handed back as a blob URL. Always a
 *     real download.
 *   - off disk (file://) a page is an opaque origin: fetch() is refused,
 *     XHR is refused, and the download attribute is ignored - a link click
 *     would navigate this very tab to the PNG. Nothing in the page can
 *     reach the bytes, so the skin opens in a new tab instead and the
 *     browser's own image viewer saves it; this page stays put.
 * ------------------------------------------------------------------ */

function downloadSkin(event, button) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    var card = button;
    while (card && card.getAttribute && !card.getAttribute('data-skin-url')) card = card.parentNode;
    if (!card || !card.getAttribute) return null;

    var url = card.getAttribute('data-skin-url');
    var fileName = card.getAttribute('data-skin-file') || (card.getAttribute('data-skin-name') + '.png');

    var finish = function (href) {
        var link = document.createElement('a');
        link.href = href;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    var openInViewer = function () {
        // The bytes are out of reach (the page is off disk): open the file in
        // a new tab for a right-click / Ctrl+S save. Never navigate this page.
        window.open(url, '_blank', 'noopener');
    };

    if (typeof window.fetch === 'function' && typeof URL.createObjectURL === 'function') {
        window.fetch(url).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.blob();
        }).then(function (blob) {
            var href = URL.createObjectURL(blob);
            finish(href);
            // the click above has already started the download, so the URL
            // can go once the browser has had a fair chance to use it
            setTimeout(function () {
                try { URL.revokeObjectURL(href); } catch (e) { /* already gone */ }
            }, 30000);
        }).catch(openInViewer);
    } else {
        openInViewer();
    }

    return fileName;
}
