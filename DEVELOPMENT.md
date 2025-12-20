# SuttaCentral Static

## To run locally

1. Clone repo, install [Node](https://nodejs.org/en/download) then [PNPM](https://pnpm.io/installation)
1. Install packages: `pnpm i` (all commands should be run from the root directory)
1. Build site: `pnpm run dev:fresh` and practice patience while it hits over 127,000 SuttaCentral API's to get the data for the whole site, then builds it all (after fetching once it caches the data indefinitely)
1. You now have a fully functioning local version of the site that works offline, with the latest data

## To contribute

See <https://todo.sr.ht/~benmneb/suttacentral-static> for inspiration, but note that this project is feature-complete and all future updates will be reserved for fixes/enhancements

## To deploy and release

The final build is 46,000+ HTML files at over 715mb uncompressed. This is pretty big for a static site, and the only free-tier I know for sure that can handle it is Vercel. But, to get around their free-tier [limits](https://vercel.com/docs/limits) of build time (45 mins), static file count (15,000), and total files size (100mb), the trick is to first build it somewhere other than their servers, then compress the result and upload it to Vercel for hosting

Following are two options to do that. The first builds locally on your machine, and the second builds on GitHub Actions. They both then deploy to a free [Vercel account](https://vercel.com/signup) via the corresponding environment variables/secrets (see each section below)

If you have set the additional environment variables, it can also upload a gzipped archive of the site build to GitHub and/or Codeberg releases based on versioned git tags

1. After it's running locally (steps above), edit the `_siteMetaData.js` file appropriately
1. [Create a project](https://vercel.com/new) to host it on Vercel (and add any custom domains)
1. Choose your own destiny:

### 1. Locally

_Build Locally, Deploy Globally™_

#### Required environment variables

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
   pnpm run release:upload
   ```

   - Script finds the git tag, creates archive, and uploads it to GitHub/Codeberg releases
   - Script deploys to Vercel production

   **Or, use Dry Run mode** (for testing without uploads):

   ```bash
   pnpm run release:dry
   ```

   - Creates archive but skips all uploads and deployments
   - Uses test tag if no git tag exists

   **Or, just deploy to Vercel** (without creating a release):

   ```bash
   pnpm run deploy:prod  # production
   pnpm run deploy:dev   # preview
   ```

#### Note

- Version tags must start with lowercase `v` (e.g., `v1.0.0`)
- The local Eleventy cache of fetched data from SuttaCentral APIs will persist until manually deleted or you run `pnpm run build:refetch`

### 2. Via Github Actions

The `.github/workflows/` handle everything: building, archiving, uploading releases to Codeberg/GitHub, and deploying to Vercel. The only manual intervention required (at this point, until there's tests to ensure the SuttaCentral API's haven't changed) is to review the preview deployment, then promote it to production by simply publishing the Github release

#### Required GitHub Secrets

Configure these in the repo settings (Settings → Secrets and variables → Actions):

- `VERCEL_TOKEN` - Token from Vercel dashboard (Account Settings → Tokens)
- `VERCEL_ORG_ID` - From `.vercel/project.json` or Vercel dashboard
- `VERCEL_PROJECT_ID` - From `.vercel/project.json` or Vercel dashboard
- `CODEBERG_TOKEN` - Personal access token from Codeberg (optional)
- `CODEBERG_REPO` - Format: "owner/repo" (optional)

Note: `GITHUB_TOKEN` is automatically provided by GitHub Actions. Codeberg is optional - workflows will skip it if not configured.

#### The workflow triggers when

1. **Pull request to main** (opened/updated/reopened)
   - Runs `pr-preview` job
   - Builds site with `pnpm run predeploy`
   - Creates archive for preview deployment
   - Deploys to Vercel preview and adds link to PR comment

2. **Tag `v*.*.*` is pushed to main**
   - Runs `check-tag` job to verify tag is on main branch
   - If tag is on main → runs `release-draft` job:
     - Builds site with `pnpm run predeploy`
     - Creates archive named: `scx_archive-{version}.tar.gz`
     - Deploys to Vercel preview
     - Creates **draft** GitHub release with preview URL
     - **Next step**: Review preview URL, then edit the draft release notes as necessary and publish the draft GitHub release to both deploy to production and upload to Codeberg releases
   - If tag is NOT on main → skips draft release creation

3. **Manual trigger** (click button in GitHub Actions UI)
   - Runs `content-refresh` job
   - Builds site with `pnpm run predeploy`
   - Creates unique preview tag (e.g., `v1.3.0-content-refresh-20251218-143022`)
   - Pushes tag to GitHub and Codeberg automatically
   - Creates archive: `scx_archive-{version}-content-refresh-{date}.tar.gz`
   - Deploys to Vercel preview
   - Creates **pre-release** GitHub release with preview URL
   - **Next steps**: Review preview URL, then edit the pre-release notes as necessary and uncheck "Set as a pre-release" to promote to production
     - Publishing will automatically deploy to Vercel production and upload to Codeberg releases
     - Preview tag is automatically cleaned up from all remotes when published or deleted

4. **Monthly schedule** (1st of month at midnight UTC)
   - Same as manual trigger (runs `content-refresh` job)
   - Automatically builds with fresh content from SuttaCentral APIs monthly
   - Creates pre-release for review before manual promotion to production

**All the above (tag push, manual, or scheduled) automatically trigger releases and deployments for review, not for production.**

Then, when you publish the draft release or pre-release in GitHub UI, it automatically triggers the production deployment:

- Downloads the exact same archive from the published release
- Deploys to Vercel production
- Uploads to Codeberg releases (if the secrets exist, otherwise skips)

**Note on data fetching:** GitHub Actions workflows always fetch fresh data from SuttaCentral APIs on every build. The cache directory created by Eleventy (~1.6GB with 234,000+ files) is too large for GitHub Actions to save. Fresh fetches usually complete in ~4-5 minutes on GitHub's servers.

#### Example release workflows

**Code release (with code changes):**

1. Make changes on a feature branch
1. Create PR to main → automatic preview deployment (fetches fresh data) with link in PR comment
1. Merge PR to main
1. Checkout main: `git checkout main && git pull`
1. Create annotated tag: `git tag -a v1.0.0 -m "Release v1.0.0" -m "About the update..."`
1. Push tag: `git push origin v1.0.0`
1. Wait for GitHub Actions to build and create draft release
1. Review the draft and check the preview URL
1. If satisfied, click "Publish release" in Github UI
1. Production deployment happens automatically

**Content refresh (update data from SuttaCentral APIs only):**

1. Go to Actions tab in GitHub
1. Click "Build & Preview" workflow
1. Click "Run workflow" → "Run workflow" button
1. Wait for build to complete (~30 minutes total)
1. Review the pre-release and check the preview URL
1. If satisfied, edit the release and uncheck "Set as a pre-release" to publish
1. Publishing automatically deploys to production and uploads to Codeberg ✨

#### Tag format

- Must start with lowercase `v` (e.g., `v1.3.0`, `v2.0.1`)
- Expects semantic versioning
- Tag must be on main branch to trigger workflow
