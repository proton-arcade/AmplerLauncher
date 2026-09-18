/*
 * Ampler Launcher - skin manifest.
 *
 * THE SKINS PAGE IS JUST A FOLDER. To add or remove a skin, add or remove a
 * folder in website/skins/ - there is no build step and no code to write:
 *
 *     website/skins/
 *       skin template/
 *         skin template.png            <- the skin itself
 *         preview.skin template.png    <- the picture shown on the card
 *       creeper/
 *         creeper.png
 *         preview.creeper.png
 *
 * The folder name is the skin name. The two files inside follow the pattern
 *
 *     <name>.png            (the skin)
 *     preview.<name>.png    (the preview image - optional, see below)
 *
 * A browser opened straight off disk cannot list a folder, so the page goes
 * by the two lists below. After adding or removing a folder, run
 *
 *     python3 website/tools/bake-skins.py
 *
 * once: it writes the folder listing into website/skins/list.js, which this
 * page loads on every boot, and the reload is all it takes. (The same tool
 * keeps that file in step with the folder, so editing it never needed.)
 *
 * Editing the list in here by hand works too - one line per folder:
 *
 * window.AMPLER_SKINS = [
 *     { name: 'skin template' },
 *     { name: 'creeper' },
 *     { name: 'my skin' }        // <- a folder added by hand
 * ];
 *
 * This list decides the order; anything baked into skins/list.js is appended
 * after it. A folder that has been deleted is simply skipped instead of
 * leaving a dead box.
 *
 * Missing preview? Not a problem: the download card draws the front of the
 * character from the skin file itself, so a bare <name>.png still shows up.
 */

window.AMPLER_SKINS = [
    { name: 'skin template' },
    { name: 'creeper' }
];

/* Where the skins live, and what the preview file is called. Both are only
   used to build the paths on the cards - they match the layout above. */
window.AMPLER_SKIN_DIR = './website/skins/';
window.AMPLER_SKIN_PREVIEW_PREFIX = 'preview.';
