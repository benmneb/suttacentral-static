# SuttaCentral Static

## Running locally

1. Clone repo, install [Node](https://nodejs.org/en/download) then [PNPM](https://pnpm.io/installation)
1. Install packages: `pnpm i` (all commands should be run from the root directory)
1. Build site: `pnpm dev:fresh` and practice patience while it hits over 127,000 SuttaCentral API's to get the data for the whole site, then builds it all (after fetching once it caches the data indefinitely)
1. You now have a fully functioning local version of the site that works offline, with the latest data
1. Run `pnpm tauri:build` to build this into a native desktop app for your platform (macOS, Windows, Linux). Android apps are only built in CI (see [App builds](#app-builds))

## Contributing

See <https://todo.sr.ht/~benmneb/suttacentral-static> for inspiration, but note that this project is feature-complete and all future updates will be reserved for fixes/enhancements

## Deploying and releasing

The final build is 138,000+ HTML files at about 3.4gb uncompressed. This is pretty big for a static site, and the only free-tier I know for sure that can handle it is Vercel. But, to get around their free-tier [limits](https://vercel.com/docs/limits) of build time (45 mins), static file count (15,000), and total files size (100mb), the trick is to first build it somewhere other than their servers, then compress the result and upload it to Vercel for hosting

Following are two options to do that. The first builds locally on your machine, and the second builds on GitHub Actions. They both then deploy to a free [Vercel account](https://vercel.com/signup) via the corresponding environment variables/secrets (see each section below)

If you have set the additional environment variables, it can also upload a gzipped archive of the site build and a [Kiwix](https://kiwix.org) ZIM file of it to GitHub and/or Codeberg releases based on versioned git tags, with PGP-signed checksums

When using Github Actions, these releases also automatically include native apps for macOS (ARM64 + Intel), Windows, Linux, and Android, for easier use of the offline archive

1. After it's running locally (steps above), edit the `_siteMetaData.js` file appropriately
1. [Create a project](https://vercel.com/new) to host it on Vercel (and add any custom domains)
1. Choose your own destiny:

### 1. Locally

_Build Locally, Deploy Globally™_

#### Environment variables

You need a `.env` file with these: (any missing vars will just skip that provider)

- `VERCEL_TOKEN` - Authentication token from Vercel dashboard (Account Settings → Tokens)
- `VERCEL_ORG_ID` - From `.vercel/project.json` or Vercel dashboard
- `VERCEL_PROJECT_ID` - From `.vercel/project.json` or Vercel dashboard
- `GITHUB_TOKEN` - Personal access token from GitHub
- `GITHUB_REPO` - Format: "owner/repo"
- `CODEBERG_TOKEN` - Personal access token from Codeberg
- `CODEBERG_REPO` - Format: "owner/repo"

#### Local workflow

1. **Create and push a git tag**

   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0" -m "About the update..."
   git push origin v1.0.0
   ```

2. **Release it**

   ```bash
   pnpm release:upload
   ```

   - Script finds the git tag, creates archive and ZIM, and uploads them to GitHub/Codeberg releases
   - It also uploads `SHA256SUMS.txt` for them, signed as `SHA256SUMS.txt.asc` if gpg has the release key (otherwise unsigned, with a warning)
   - Script deploys to Vercel production

   **Or, use Dry Run mode** (for testing without uploads):

   ```bash
   pnpm release:dry
   ```

   - Creates archive and ZIM but skips signing, uploads and deployments
   - Uses test tag if no git tag exists
   - `pnpm release:dry nozim` skips the ZIM, as PR previews do

   **Or, just build the ZIM** (into `.dist`, from `_site` as it is):

   ```bash
   pnpm build:zim                      # scx_archive-0.0.0-test.zim
   ONLY_UIDS=mn1,dn33 pnpm build:zim   # just those texts' pages, for a quick test
   ```

   - Its dependencies are in `zim/`, installed by this command rather than `pnpm i`

   **Or, just deploy to Vercel** (without creating a release):

   ```bash
   pnpm deploy:prod  # production
   pnpm deploy:dev   # preview
   ```

   **And/or, build your own offline native app for your device** (without creating a release):

   ```bash
   pnpm tauri:dev    # development preview
   pnpm tauri:build  # standalone app
   ```

#### Note

- Version tags must start with lowercase `v` (e.g., `v1.0.0`)
- The local Eleventy cache of fetched data from SuttaCentral APIs will persist until manually deleted or you run `pnpm build:refetch`
- A full build (`pnpm predeploy`, or any build in CI) stops if a fetch still fails after its retries, rather than leaving out what it was for. `pnpm predeploy` then fetches only what's missing
- `SKIP_FETCH=1` on a build, ie `SKIP_FETCH=1 pnpm build:sample`, saves the data it fetched to `.tree-cache` (about 800MB) for later ones to read in seconds. They fetch again once the data code or `.cache` changes. Delete `.tree-cache` after editing a file in `.cache` by hand
- The build runs in stages: `build:texts`, `build:define`, `build:nav`, then `build:site-pages`. `pnpm build:refetch` fetches everything again in the first stage, and the later stages reuse that. Each stage prints the time the refetch started from, ie `REFETCH=1762300000`. If a stage fails, run it and the stages after it with that same value, so nothing is fetched twice, and with `FULL_BUILD=1`, which fails a stage whose CSS, JS or map base changed since an earlier one. Then finish with the sitemap and search:

  ```bash
  REFETCH=1762300000 FULL_BUILD=1 pnpm build:nav && REFETCH=1762300000 FULL_BUILD=1 pnpm build:site-pages && pnpm build:sitemap && pnpm build:search
  ```

### 2. Via Github Actions

The `.github/workflows/` handle everything: building, archiving, building desktop apps, uploading releases to Codeberg/GitHub, and deploying to Vercel. Every build is checked by [the tests](#tests), and a release that passes them publishes and deploys to production itself. One that fails waits for you to review its preview deployment, then promote it to production by simply publishing the Github release

#### GitHub Secrets

Configure these in the repo settings (Settings → Secrets and variables → Actions - any missing vars will just skip that feature):

- `VERCEL_TOKEN` - Token from Vercel dashboard (Account Settings → Tokens)
- `VERCEL_ORG_ID` - From `.vercel/project.json` or Vercel dashboard
- `VERCEL_PROJECT_ID` - From `.vercel/project.json` or Vercel dashboard
- `CODEBERG_TOKEN` - Personal access token from Codeberg (optional)
- `CODEBERG_REPO` - Format: "owner/repo" (optional)
- `PGP_PRIVATE_KEY` - Private key to sign release checksums (export with `gpg --armor --export-secret-keys YOUR_KEY_ID`)
- `PGP_PASSPHRASE` - Passphrase for the private key
- `ANDROID_KEYSTORE_BASE64` - Keystore to sign Android apps (create with `keytool -genkeypair`, then `base64 -i release.jks`)
- `ANDROID_KEYSTORE_PASSWORD` - Password for the keystore
- `ANDROID_KEY_ALIAS` - Alias of the key in the keystore

Note: `GITHUB_TOKEN` is automatically provided by GitHub Actions. Codeberg is optional - workflows will skip it if not configured.

#### GitHub Variables

- `AUTO_DEPLOY` - Set to `false` (Settings → Secrets and variables → Actions → Variables) to stop releases deploying themselves when they pass the tests, so every release waits for you to publish it. Anything else, or not set, leaves auto-deploy on

#### The workflow triggers when

1. **Pull request to main** (opened/updated/reopened)
   - Runs `pr-preview` job
   - Builds site with `pnpm predeploy`
   - Creates archive for preview deployment
   - Deploys to Vercel preview and adds link to PR comment
   - Runs the tests, failing the PR's checks if they fail

2. **Tag `v*.*.*` is pushed to main**
   - Runs `check-tag` job to verify tag is on main branch
   - If tag is on main → runs `release-draft` job:
     - Builds site with `pnpm predeploy`, then runs the tests
     - Creates archive named: `scx_archive-{version}.tar.gz`, holding a `scx_{version}` folder and a `README.txt`
     - Deploys to Vercel preview
     - Creates **draft** GitHub release with preview URL (initially shows "builds in progress" warning)
   - Runs `build-tauri` jobs in parallel (macOS ARM64, macOS Intel, Windows, Linux, Android ARM64, Android ARMv7):
     - Builds apps for each platform
     - Attaches `.dmg`, `.exe`, `.AppImage`, `.apk` to the draft release
   - Runs `build-zim` job in parallel, attaching `scx_archive-{version}.zim` to the draft release
   - Runs `sign-release` job to attach `SHA256SUMS.txt` for the archives and apps, PGP-signed
   - Runs `finalize-release` job when all builds complete to update release body with which platforms built, and whether the tests passed
   - If the tests passed → publishes the release and runs `auto-deploy` (see below)
   - **Next step** if they failed: Review preview URL and publish when release shows all builds complete
   - If tag is NOT on main → skips draft release creation

3. **Manual trigger** (click button in GitHub Actions UI)
   - Runs `content-refresh` job
   - Builds site with `pnpm predeploy`, then runs the tests
   - Creates unique preview tag (e.g., `v1.3.0-content-refresh-20251218-143022`)
   - Pushes tag to GitHub and Codeberg automatically
   - Creates archive: `scx_archive-{version}-content-refresh-{date}.tar.gz`
   - Deploys to Vercel preview
   - Creates **pre-release** GitHub release with preview URL (initially shows "builds in progress" warning)
   - Runs build-tauri jobs in parallel (macOS ARM64, macOS Intel, Windows, Linux, Android ARM64, Android ARMv7):
     - Builds apps for each platform
     - Attaches `.dmg`, `.exe`, `.AppImage`, `.apk` to the pre-release
   - Runs `build-zim-content-refresh` job in parallel, attaching `scx_archive-{version}-content-refresh-{date}.zim`
   - When all builds complete it updates release body with which platforms built, and whether the tests passed
   - If the tests passed → promotes the pre-release to a release and runs `auto-deploy-content-refresh` (see below)
   - **Next step** if they failed: Review preview URL and uncheck "Set as a pre-release" when release shows all builds complete
     - Publishing will automatically deploy to Vercel production and upload all assets to Codeberg releases
     - Preview tag is automatically cleaned up from all remotes when published or deleted

4. **Monthly schedule** (1st of month at midnight UTC)
   - Same as manual trigger (runs `content-refresh` job)
   - Automatically builds with fresh content from SuttaCentral APIs monthly
   - Creates pre-release, promoted to production if it passes the tests, or for review before manual promotion if not

**All the above (tag push, manual, or scheduled) automatically trigger releases and preview deployments. Those that pass the tests go on to production by themselves, and the rest wait for review.**

Then, when a release passes the tests, or you publish a draft release or pre-release in GitHub UI, it deploys to production (`deploy-release.yml`):

- Downloads all release assets (archives + apps)
- Deploys to Vercel production
- Uploads all assets to Codeberg releases (if the secrets exist, otherwise skips)

**Note on data fetching:** GitHub Actions workflows always fetch fresh data from SuttaCentral APIs on every run. Fresh fetches usually complete in ~4-5 minutes on GitHub's servers. A build that fails saves its cache for that run only, so "Re-run failed jobs" fetches only what's missing

#### Example release workflows

**Code release (with code changes):**

1. Make changes on a feature branch
1. Create PR to main → automatic preview deployment (fetches fresh data) with link in PR comment
1. Merge PR to main
1. Checkout main: `git checkout main && git pull`
1. Create annotated tag: `git tag -a v1.0.0 -m "Release v1.0.0" -m "About the update..."`
1. Push tag: `git push origin v1.0.0`
1. Wait for GitHub Actions to build and create draft release (archive + desktop apps for all platforms)
1. If the tests passed, it publishes and deploys to production by itself. Done ✨
1. If not, review the draft, the failed tests, the preview URL and assets
1. If satisfied, click "Publish release" in Github UI
1. Production deployment and Codeberg upload happens automatically

**Content refresh (update data from SuttaCentral APIs only):**

1. Go to Actions tab in GitHub
1. Click "Build & Preview" workflow
1. Click "Run workflow" → "Run workflow" button
1. Wait for build to complete (~30 minutes total)
1. If the tests passed, it publishes and deploys to production by itself. Done ✨
1. If not, review the pre-release, the failed tests, the preview URL and assets
1. If satisfied, edit the release and uncheck "Set as a pre-release" to publish
1. Publishing automatically deploys to production and uploads to Codeberg ✨

#### Tests

`pnpm test` checks a built site (`_site`, or the folder in `SITE_DIR`) for signs the data fetched from SuttaCentral's APIs broke something, as a site can build without errors and still be missing texts or have empty pages, and for invalid or inaccessible markup. Features are tested by hand while developing. The HTML check runs on Java and the accessibility check in Brave or Chrome, and the first run downloads either into `node_modules` if it isn't installed (`JAVA` and `BROWSER_PATH` pick your own):

- **Fetch:** no API requests failed, besides `/publication_info` which fails for most translators
- **Inventory:** at most 1% of production's pages are missing (5% of any one collection), each piṭaka has its texts, and the sitemap lists every page. Production's sitemap and search index are the baseline, so `SKIP_BASELINE=1` skips these comparisons offline
- **Pages:** every page has a title, every text page has its text and a well-formed title, every navigation page has links, and no links have `undefined` or similar in them
- **Golden pages:** a page for each shape of data (segmented, root, legacy, range, vinaya, abhidhamma, pātimokkha, navigation) matches the API data in `.cache` it was built from
- **Links:** internal links go to pages that exist
- **Search:** the search index has every text page, and hasn't shrunk since production, the extra indexes have every text's titles, every English note once, every Chinese text and every site page, the reference files only list text pages with their titles, `volpage:DN ii 72` finds DN 16, and simplified Chinese has its traditional forms
- **Site pages:** every key the site pages use is in the strings fetched from .net (read from `.cache`, no build needed), and every page in the site pages menu is built with a heading and its text
- **HTML:** every page passes the [Nu validator](https://validator.w3.org/nu/) with no errors or warnings
- **Accessibility:** a sample of each kind of page in each collection (or just the pages in `AXE_PAGES=/mn1/en/sujato/,/about/`) has no [axe-core](https://github.com/dequelabs/axe-core) violations of WCAG 2.2 A/AA or its best practices, in light and dark mode and at a phone's width, and none of AAA (mainly 7:1 contrast) with `prefers-contrast: more`. `AXE_MAX_PAGES` caps the sample
- **Structured data:** every page's JSON-LD only uses schema.org types, with properties where they belong (checked against a pinned version of schema.org's vocabulary, fetched once into `.cache`), its language tags are canonical BCP 47, and its meta and Open Graph tags are valid
- **Dictionaries:** each dictionary in `.cache` has at least about 95% of the words it had (no build needed), the `/define` pages have their entries and `/map` links to them, and word lookup's files are all there and answer at least 97% of the sample texts' words, with a `/define` page

The site's structure comes from SuttaCentral's APIs, so pages coming and going with them is fine - only losing more than a few fails. The limits are constants at the top of each `tests/*.test.js` file. On a full build a run takes about 3 minutes reading the mass of HTML, about 15 for the accessibility check, then the HTML check, which takes longest as it parses every page again. Results only show once each check is done, so the slow ones count their pages as they go. `node --test tests/links.test.js` runs one file.

#### Tag format

- Must start with lowercase `v` (e.g., `v1.3.0`, `v2.0.1`)
- Expects semantic versioning
- Tag must be on main branch to trigger workflow

#### App builds

Releases include apps built with [Tauri](https://tauri.app/) for:

- **macOS ARM64** (Apple Silicon M1+) - `.dmg`
- **macOS Intel** (x86_64) - `.dmg`
- **Windows** - `.exe`
- **Linux** - `.AppImage`
- **Android ARM64** (most devices) - `.apk`
- **Android ARMv7** (older 32-bit devices) - `.apk`

App builds run in parallel with the main release workflow. The release is created immediately with a preview URL and "builds in progress" warning, then updated to "✅ All platforms ready" when all builds complete. Desktop apps use [tauri-action](https://github.com/tauri-apps/tauri-action), and all builds use Rust caching for faster subsequent builds. App builds are only triggered for releases (tag push + content-refresh), not for PR previews

CI generates the Android project (`tauri/gen/android`) on each build with `tauri android init`, copies in the app icons and `tauri/android/MainActivity.kt`, builds it with the Tauri CLI, then signs the APK. Generating it in CI means no Android SDK is needed locally, and using the CLI rather than tauri-action leaves room for the steps between. Each ABI is a separate APK as the whole site is embedded per ABI, so a universal APK would be several times larger. The `versionCode` is the workflow run number, so every release installs over the previous one as an update

**Kiwix ZIM:** `zim/build.js` writes `_site` into a ZIM without changing it, so the web and app builds stay as they are. It fails if a link that works on the web doesn't in the ZIM, or if a site script or Pagefind update adds a URL its rewriting doesn't cover. Some readers can't run everything, so the ZIM hides what can't work there:

- **Listen** shows only where the reader has the Web Speech API, so not in Kiwix for Android or Kiwix Desktop
- **Search, word lookup and simplified Chinese** need to fetch files, which Kiwix Desktop 2.5.1 and older can't, so they're hidden there, and its own full-text search (in every ZIM) stands in
- **Settings** don't last between sessions in Kiwix Desktop, and start afresh with each new ZIM in the iOS and macOS apps
- Kiwix Desktop's contents list has the headings of menus and popovers too, as it reads the page from outside its scripts' reach
- Kiwix Desktop from Linux distros' own repositories is on a browser engine too old for the site's CSS

**Note on "Listen"**: The Android app's webview doesn't support the Web Speech API, so the "Listen" button is hidden there (as in any browser without it). The Linux app's WebKitGTK may have no voices available, in which case Listen shows its "No voices found" message. You can always use the website in a browser for the "Listen" feature

#### Handling partial builds and build failures

The workflow is designed to gracefully handle situations where some platform builds fail (e.g., Windows build fails but macOS/Linux succeed):

**Automatic graceful degradation:**

- If any Tauri build fails, the workflow continues (doesn't stop)
- `sign-release` job runs and signs whatever artifacts exist (skips if all builds failed)
- `finalize-release` job runs and updates the release body to show which platforms succeeded
- Release is marked with a warning showing available vs. missing platforms

**Example scenarios:**

1. **All builds succeed** - Release shows "✅ All platforms ready" as normal
2. **Windows build fails** - Release shows "⚠️ Partial Build" with list of available platforms (macOS, Linux)
3. **All builds fail** - Release shows "⚠️ Build Failure" warning with link to Actions tab for debugging

**Recovering from failed builds:**

If a build fails, can try again to add it to the existing release:

1. Go to the workflow run in GitHub Actions
2. Click "Re-run failed jobs" to rebuild only the failed platform(s)
3. Wait for the failed build(s) to complete (artifacts upload to the same release)
4. Find the `sign-release` job and click ⋮ → "Re-run job" (one click)
5. The `finalize-release` job automatically reruns as well
6. Checksums regenerate to include all current artifacts
7. Release body updates to show the newly available platforms

**Important notes:**

- You only need to click "Re-run job" once (on `sign-release`)
- The release body automatically updates - old warnings are replaced, not appended
- No need to rerun the expensive 1+ hour site build
- This works for both tag-based releases and content-refresh releases

#### Release signing and verification

These builds are not code-signed to avoid $200-500 USD/year in certificate costs. The apps are safe and built from public source code, but your OS may require manual approval on first launch

The exception is the Android APKs, which are signed in CI with this project's own key so new versions install over old ones as updates.

**macOS:**

- Download and open the `.dmg` file appropriate for your machine
- You'll see _"cannot be opened because it is from an unidentified developer"_
- Go to **System Settings → Privacy & Security**
- Click **"Open Anyway"** next to the blocked app message
- Click **"Open"** in the confirmation dialog

**Windows:**

- Download and extract the `.exe` file
- You'll see _"Windows protected your PC"_
- Click **"More info"**
- Click **"Run anyway"**

**Linux:**

- No security warnings - just download and run.

**Android:**

- Download the `android_arm64` APK, or `android_armv7` for older 32-bit devices
- Open it, and allow your browser or file manager to _"Install unknown apps"_ when asked
- If Play Protect warns about an unknown developer, tap **"More details"** then **"Install anyway"**

**All releases include PGP-signed SHA256 checksums for verification of the archives and apps:**

- `SHA256SUMS.txt` - checksums for all artifacts
- `SHA256SUMS.txt.asc` - PGP signature

Verify checksum matches

```bash
sha256sum -c --ignore-missing SHA256SUMS.txt
```

Import my public key

```bash
gpg --keyserver keys.openpgp.org --recv-keys AECABD60A4CB5BE900864AF2C8DAB4CE409C4AB8
```

Verify signature

```bash
gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt
```

**Android APKs can also be verified on-device** (with any app verifier app) against the following signing certificate's SHA-256 fingerprint. CI refuses to publish an APK that doesn't match it (`ANDROID_CERT_SHA256` in the workflow):

```text
4A:4C:B7:86:C3:4C:CE:76:7D:C6:B8:D1:7B:BC:3F:F1:91:31:30:D2:59:16:E6:B8:61:AD:DF:C8:AB:9F:C0:AB
```
