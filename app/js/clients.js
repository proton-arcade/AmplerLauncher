/*
 * Ampler Launcher - offline client manifest.
 *
 * Loaded as a classic script (not an ES module) on purpose: <script src> works
 * from file:// in every browser, whereas fetch()/import() do not. That is what
 * lets the launcher render its version list with no server and no network.
 *
 * Every entry with bundled:true points at a file that exists in this repo.
 * verify-offline.mjs asserts that, so this list cannot drift from disk.
 */

window.AMPLER_CLIENTS = [

    /* ---------- Eaglercraft: Web Edition ---------- */

    {
        id: '1.12.2',
        category: 'web',
        title: 'Latest release',
        version: '1.12.2-u3',
        icon: './app/images/m-logo1.png',
        path: 'app/mc/1.12.2/index.html',
        bundled: true,
        source: 'Eaglercraft_1.12.2_u3_Offline.zip'
    },
    {
        id: '1.12.2-wasm',
        category: 'web',
        title: 'Latest release WASM',
        version: '1.12.2-u3-wasm',
        icon: './app/images/m-logo1.png',
        path: 'app/mc/1.12.2-wasm/index.html',
        bundled: true,
        wasm: true,
        source: 'Eaglercraft_1.12.2_u3_WASM_Offline.zip'
    },
    {
        id: '1.8.8',
        category: 'web',
        title: 'Previous release',
        version: '1.8.8-u53',
        icon: './app/images/m-logo2.png',
        path: 'app/mc/1.8.8/index.html',
        bundled: true,
        source: 'EaglercraftX_1.8_u53_Offline_Signed.zip'
    },
    {
        id: '1.8.8-wasm',
        category: 'web',
        title: 'Previous release WASM',
        version: '1.8.8-u53-wasm',
        icon: './app/images/m-logo2.png',
        path: 'app/mc/1.8.8-wasm/index.html',
        bundled: true,
        wasm: true,
        source: 'EaglercraftX_1.8_u53_WASM-GC_Offline.zip'
    },
    {
        id: '1.5.2',
        category: 'web',
        title: 'Older release',
        version: '1.5.2-sp2.01',
        icon: './app/images/m-logo11.png',
        path: 'app/mc/1.5.2/index.html',
        bundled: true,
        source: 'Eaglercraft_1.5.2-sp2.01_Offline.zip'
    },

    /* ---------- Eaglercraft: Modded Editions ----------
     *
     * None of the modded clients ship in the six archives this offline build
     * is assembled from, and upstream they are 30-300 MB each. They are listed
     * so the launcher is honest about what is and is not installed instead of
     * handing back a dead link. Drop a self-contained build at the path below
     * and flip bundled to true to enable one.
     */

    {
        id: 'eaglerforge',
        category: 'modded',
        title: 'Eaglerforge',
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo5.png',
        path: 'app/mc/eaglerforge/index.html',
        bundled: false
    },
    {
        id: 'resentclient',
        category: 'modded',
        title: 'Resent Client',
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo4.png',
        path: 'app/mc/resentclient/index.html',
        bundled: false
    },
    {
        id: 'shadowclient',
        category: 'modded',
        title: 'Shadow Client',
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo3.png',
        path: 'app/mc/shadowclient/index.html',
        bundled: false
    },
    {
        id: 'starlikeclient',
        category: 'modded',
        title: 'Starlike',
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo6.png',
        path: 'app/mc/starlikeclient/index.html',
        bundled: false
    },
    {
        id: 'astraclient',
        category: 'modded',
        title: 'Astra Client',
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo7.png',
        path: 'app/mc/astraclient/index.html',
        bundled: false
    },

    /* ---------- Eaglercraft: Mobile / Controller ----------
     *
     * The old launcher reached these with mc/1.8.8/?userscript=<name>.js. The
     * offline single-file builds do not implement userscript loading at all
     * (the string "userscript" appears zero times in all five), so that query
     * parameter is a no-op now. These need a purpose-built offline build.
     */

    {
        id: 'flameddogo-mobile',
        category: 'mobile',
        title: "FlamedDogo's Mobile UI",
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo10.png',
        path: 'app/mc/flameddogo-mobile/index.html',
        bundled: false
    },
    {
        id: 'red-mobile',
        category: 'mobile',
        title: "Red's Mobile UI",
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo9.png',
        path: 'app/mc/red-mobile/index.html',
        bundled: false
    },
    {
        id: 'red-controller',
        category: 'mobile',
        title: "Red's Controller Support",
        version: '1.8.8 - not bundled',
        icon: './app/images/m-logo8.png',
        path: 'app/mc/red-controller/index.html',
        bundled: false
    }
];

window.AMPLER_CATEGORIES = {
    web: {
        heading: 'EAGLERCRAFT WEB EDITION',
        background: './app/images/web-edition.jpg',
        logo: './app/images/web-title.png',
        tab: 'gtabs2'
    },
    modded: {
        heading: 'EAGLERCRAFT MODDED',
        background: './app/images/modded-edition.jpg',
        logo: './app/images/modded-title.png',
        tab: 'gtabs3'
    },
    mobile: {
        heading: 'EAGLERCRAFT MOBILE/CONTROLLER',
        background: './app/images/controls-edition.jpg',
        logo: './app/images/controls-title.png',
        tab: 'gtabs4'
    }
};
