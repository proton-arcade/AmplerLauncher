/*
 * Ampler Launcher - skin manifest.
 *
 * THE SKINS PAGE IS JUST A FOLDER. To add or remove a skin, add or remove a
 * folder in website/skins/ - there is no setup, no build step and no code to
 * write:
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
 *     preview.<name>.png    (the preview image)
 *
 * then the folder gets one line in the list below. Delete the folder and the
 * line to remove the skin again.
 *
 * Missing preview? Not a problem: the download card draws the front of the
 * character from the skin file itself, so a bare <name>.png still shows up.
 *
 * (The "Add skin folder" button on the Skins page loads folders straight off
 * disk for the session as well, for trying a skin out before committing it.)
 */

window.AMPLER_SKINS = [
    { name: 'skin template' },
    { name: 'creeper' }
];

/* Where the skins live, and what the preview file is called. Both are only
   used to build the paths on the cards - they match the layout above. */
window.AMPLER_SKIN_DIR = './website/skins/';
window.AMPLER_SKIN_PREVIEW_PREFIX = 'preview.';

/* Accepted image types for a skin / preview file. */
window.AMPLER_SKIN_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
