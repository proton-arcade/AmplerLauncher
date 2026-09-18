/*
 * The folder listing for the Skins page.
 *
 * This file is the OFFLINE PLACEHOLDER, so the launcher always has something
 * to load, from anywhere, with no setup.
 *
 * A browser cannot list a folder by itself, so after dropping a skin folder
 * into (or deleting one from) website/skins/, run
 *
 *     python3 website/tools/bake-skins.py
 *
 * once: it writes the listing into this file, and a reload of index.html is
 * the whole update. The order the page shows them in lives in
 * website/js/skins.js.
 */

window.AMPLER_SKINS_FROM_DIR = [];
