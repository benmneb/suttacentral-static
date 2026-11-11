# Development Notes

## Running locally

1. Clone repo, install [Node](https://nodejs.org/en/download) then [PNPM](https://pnpm.io/installation)
1. Install packages: `pnpm i` (all commands should be run from the root directory)
1. Build site: `pnpm dev:fresh` and practice patience while it hits over 127,000 SuttaCentral API's to get the data for the whole site, then builds it all (after fetching once it caches the data indefinitely)
1. You now have a fully functioning local version of the site that works offline, with the latest data
1. Run `pnpm tauri:build` to build this into a native desktop app for your platform

## Contributing

See <https://todo.sr.ht/~benmneb/suttacentral-static> for inspiration

### Principles

The site is built HTML first, with CSS where it's needed and JavaScript only as an enhancement. Every change is held to these:

- Every page, text and core feature is static HTML and CSS, and works without JavaScript. Search, word lookup, Listen, simplified Chinese and remembered settings need it. The rest of the deferred ~11 kB (gzipped) on a text adds to pages that already work
- Every page passes the W3C's [Nu validator](https://validator.w3.org/nu/), and its JSON-LD fits the schema.org vocabulary. Slips in SuttaCentral's data are mended as the site is built where readers would notice them, so for my sanity, a few only the validator sees are allowed to get through
- Pages are built and tested to [WCAG 2.2](https://www.w3.org/TR/WCAG22/) AA, with no axe-core violations in light and dark mode or at a phone's width. With more contrast set, text meets AAA contrast ratios. Forced colours and reduced motion are respected throughout. See [ACCESSIBILITY.md](ACCESSIBILITY.md)
- There's no render-blocking JS and no layout shift
- CSS is compiled for Chrome and Edge 105, Firefox 115 and Safari 15.4, and newer features (popovers, anchor positioning, `:has()`) sit behind `@supports` with a plainer fallback. That covers Windows 7 and 8.1 through Chrome 109 and Firefox 115 ESR, the last versions for them
- All features work offline, so the site can be packaged as self-contained archives, native apps and a ZIM

[`pnpm test`](#tests) checks all of this before each release: validity on every page, and accessibility on a sample of every kind of page

## Tests

`pnpm test` checks a built site (`_site`, or the folder in `SITE_DIR`) for signs the data fetched from SuttaCentral's APIs broke something, as a site can build without errors and still be missing texts or have empty pages, and for invalid or inaccessible markup. Features are tested by hand while developing. The HTML check runs on Java and the accessibility check in Brave or Chrome, and the first run downloads either into `node_modules` if it isn't installed (`JAVA` and `BROWSER_PATH` pick your own)

The site's structure comes from SuttaCentral's APIs, so pages coming and going with them is fine - only losing more than a few fails. The limits are constants at the top of each `tests/*.test.js` file

## Design decisions

### Search

.net searches on its own server. Here [Pagefind](https://pagefind.app) indexes the built pages (`pnpm build:search`) and runs each search in the browser, fetching only the small parts of the index it needs. This needs JS (without it, it searches DuckDuckGo, limited to this site), but it works offline with epic performance in the apps, the archive and most Kiwix readers. The search box takes .net's query syntax (filters like `in:dn`), so a .net search URL works here unchanged, plus extras like `note:` or `in:notes` for the translators' notes

### View settings

.net adds a view to the page with JS when it's picked, ie it inserts the root text once that's turned on. Here every view is already in the HTML, and each setting is a checkbox whose state (CSS `:has()`) uses to show it, so they work without JS. JS only remembers them between pages, adds the keyboard shortcuts, and helps keep your place in the text in some browsers when the layout changes. Every view setting .net has is here (plus more), with the same hot keys — except the one that changes the Pāli script

### Word lookup

.net loads its dictionaries into the browser in one fell swoop, and works out each answer there. Here the answer for every Pāli word form in the root texts is worked out as the site is built, and written into files of up to ~100 KB, grouped by prefix, so a click fetches only the file its word is in, once. The Chinese dictionary is spread over 64 files by each term's first character, so all the terms a click could match are in one file

`/define/{term}` has a page for every Pāli word with a full entry in one of SuttaCentral's dictionaries, and every DPD headword. .net also has a page for each inflected form DPD has an entry for (ie sāvatthiyaṁ), which here only its headword's page covers. That means there's about 65k `/define` pages rather than 173k, saving roughly 600–700 MB of HTML which are mostly repeats of a headword's entry

### Listen

.net's Voice button opens the text in [SuttaCentral Voice](https://www.sc-voice.net), a separate site whose audio comes from its server, and only for segmented texts. Here Listen reads the page with the browser's own speech voices, so it works offline and on every text. It needs JS. It reads whatever the view settings show (ie root text too, in the order it's shown, though it can only read one language at a time), and highlights each segment and word as it goes. The voices are the device's, so they vary in quality (but more can usually be freely downloaded from system settings) and some browsers and webviews (ie Android's) have none, so Listen is hidden there
