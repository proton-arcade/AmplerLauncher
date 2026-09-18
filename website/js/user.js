/*
 * Ampler Launcher - your username, as a file.
 *
 * When you type a name in the launcher (bottom right of the bar), it is kept
 * in the browser's local storage. Some browsers refuse to keep local storage
 * for a page opened straight off disk, or clear it when they close - with
 * those, the name would snap back to "Generic User" on every start.
 *
 * So set it here instead: whatever this line says is the name the launcher
 * boots with. A name remembered by the browser (when the browser allows it)
 * still wins, so this only shows if nothing better is known. Deleting this
 * file is fine too: the launcher then falls back to "Generic User".
 *
 * Change the name between the quotes and reload:
 *
 *     window.AMPLER_USER = 'Steve';
 */

window.AMPLER_USER = 'Generic User';
