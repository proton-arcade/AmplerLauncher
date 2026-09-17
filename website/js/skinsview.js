/*
 * Ampler Launcher - the Skins page.
 *
 * Reads js/skins.js plus the folder listing and lays the skins out as boxes
 * over the same background the Play page uses, small gap between them:
 * the preview picture on top of the box, the name in the bottom left and the
 * download button in the bottom right.
 *
 * Zero setup:
 *   - a skin folder is all it takes (see js/skins.js for the layout). Served by
 *     website/tools/serve.py, folders are found on reload with nothing to edit;
 *   - if a folder has no preview file, the picture is drawn from the skin
 *     itself - head, body, arms and legs of the classic 64x64 layout;
 *   - "Add skin folder" loads folders straight off the disk for the session.
 *
 * Downloading copies the original skin file (.png) out of the folder, exactly
 * as it sits on disk - nothing is re-encoded.
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

function isImageName(name) {
    var types = window.AMPLER_SKIN_TYPES || ['png'];
    var ext = String(name).split('.').pop().toLowerCase();
    return types.indexOf(ext) !== -1;
}

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
        previewUrl: folder + encodeURIComponent(prefix + skinName),
        session: false
    };
}

/* The library is the manifest (website/js/skins.js) plus whatever folders the
   page was told about. Served by tools/serve.py that second list is the real
   directory listing, so a folder dropped into website/skins/ turns up on its
   own; from file:// it is empty and the manifest decides, in its own order. */
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

/* Pull a skin and its preview out of one folder's worth of files. The naming
   rule is the documented one ( <name>.png + preview.<name>.png ); anything
   else in the folder is treated as a candidate so an oddly named skin still
   loads instead of silently vanishing. */
function skinFromFolder(name, entries) {
    var lower = name.toLowerCase();
    var preview = null;
    var skin = null;
    var i;

    for (i = 0; i < entries.length; i++) {
        if (/^preview[._-]/.test(entries[i].base.toLowerCase())) { preview = entries[i]; break; }
    }
    for (i = 0; i < entries.length; i++) {
        if (entries[i] === preview) continue;
        if (stripExtension(entries[i].base).toLowerCase() === lower) { skin = entries[i]; break; }
    }
    if (!skin) {
        for (i = 0; i < entries.length; i++) {
            if (entries[i] !== preview) { skin = entries[i]; break; }
        }
    }
    if (!skin) skin = preview;
    if (!skin) return null;

    return {
        name: name,
        folder: '',
        fileName: skin.base,
        skinUrl: URL.createObjectURL(skin.file),
        previewUrl: preview ? URL.createObjectURL(preview.file) : null,
        session: true
    };
}

/* Object URLs are only alive until the page unloads, so anything we are not
   going to show any more gets released by hand. Listed skins have no blobs to
   release - they point straight at files. */
function releaseBlobs(entry) {
    if (!entry || !entry.session) return;
    try { URL.revokeObjectURL(entry.skinUrl); } catch (e) { /* nothing to do */ }
    if (entry.previewUrl) {
        try { URL.revokeObjectURL(entry.previewUrl); } catch (e) { /* nothing to do */ }
    }
}

function addSkinFolders(fileList) {
    var groups = {};
    var order = [];

    Array.prototype.forEach.call(fileList, function (file) {
        if (!isImageName(file.name)) return;
        var path = file.webkitRelativePath || file.name;
        var parts = path.split('/').filter(Boolean);
        // <picked folder>/<skin folder>/<file>  ->  the skin is the folder name
        var folder = parts.length >= 2 ? parts[parts.length - 2] : 'Skins';
        if (!groups[folder]) { groups[folder] = []; order.push(folder); }
        groups[folder].push({ file: file, base: parts[parts.length - 1] });
    });

    var added = 0;
    order.forEach(function (name) {
        var entry = skinFromFolder(name, groups[name]);
        if (!entry) return;
        // a name can only appear once: the folder you just loaded wins over
        // whichever entry (listed or previously loaded) used that name, and the
        // blob URLs the replaced one was holding are released with it
        skinsState.library = skinsState.library.filter(function (s) {
            if (s.name !== name) return true;
            releaseBlobs(s);
            return false;
        });
        skinsState.library.push(entry);
        added++;
    });
    return added;
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
            : known + (known === 1 ? ' skin' : ' skins') + ' - drop a folder into website/skins/ to add your own');
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
 * ------------------------------------------------------------------ */

function downloadSkin(event, button) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    var card = button;
    while (card && card.getAttribute && !card.getAttribute('data-skin-url')) card = card.parentNode;
    if (!card || !card.getAttribute) return;

    var url = card.getAttribute('data-skin-url');
    var fileName = card.getAttribute('data-skin-file') || (card.getAttribute('data-skin-name') + '.png');
    var name = card.getAttribute('data-skin-name');

    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    toast('DOWNLOAD', 'Saved ' + fileName, '#7CFC98');
    return name;
}

/* ------------------------------------------------------------------ *
 * "Add skin folder"
 * ------------------------------------------------------------------ */

function pickSkinFolder() {
    var input = sg('skinfolder');
    if (!input) return;
    // Chrome/Edge/Safari/Firefox all honour this; without it the picker still
    // opens, just without the folder walking.
    try { input.webkitdirectory = true; } catch (e) { /* ignore */ }
    input.click();
}

function initSkinPicker() {
    var input = sg('skinfolder');
    if (!input) return;

    // The key handler lives in js/index.js (loaded first); fall back to a local
    // one so this file still works if it is ever loaded on its own.
    var button = sg('addfolder');
    if (button) {
        if (typeof activateOnKey === 'function') {
            activateOnKey(button, pickSkinFolder);
        } else {
            button.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
                event.preventDefault();
                pickSkinFolder();
            });
        }
    }
    input.addEventListener('change', function () {
        var files = input.files;
        if (files && files.length) {
            var added = addSkinFolders(files);
            if (added) {
                if (typeof showView === 'function') showView('skins');
                renderSkins();
                toast('SKINS LOADED', added + (added === 1 ? ' skin' : ' skins') +
                    ' loaded for this session. Nothing is written to disk - drop the folder into ' +
                    'website/skins/ to keep it.', '#7CFC98');
            } else {
                toast('NO SKINS FOUND', 'That folder did not contain any images.', 'goldenrod');
            }
        }
        input.value = '';
    });
}

initSkinPicker();
