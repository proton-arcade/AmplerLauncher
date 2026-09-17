/*
 * The folder listing for the Skins page.
 *
 * This file is the OFFLINE PLACEHOLDER, so the launcher always has something to
 * load: from file://, from a plain static server, from anywhere.
 *
 * When the launcher is served by website/tools/serve.py, that same path is
 * answered from the directory listing instead of from this file, so the Skins
 * page shows every folder in website/skins/ with no editing anywhere - drop a
 * folder in, reload, it is there; delete it, reload, it is gone.
 *
 * Opening index.html by double-clicking works too: press "Add skin folder" on
 * the Skins page and pick the folder, or run
 *
 *     python3 website/tools/bake-skins.py
 *
 * once to write the folder list into this file (nothing else to do after that).
 * The list that decides the offline order lives in website/js/skins.js.
 */

window.AMPLER_SKINS_FROM_DIR = [];
