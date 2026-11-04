/**
 * Build Stage
 *
 * `pnpm build` builds the site in stages, each its own process, so no one process holds every page:
 * `ONLY_TEXTS`, `ONLY_DEFINE`, `ONLY_NAV` and `ONLY_SITE` each build just their own pages, then
 * `tools/sitemapIndex.js` lists every stage's sitemaps. Without a flag, it's every page in one go.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

const STAGES = ['texts', 'define', 'nav', 'site']

/** The stage this build is, ie `texts` for `ONLY_TEXTS`, or undefined for every page */
export const buildStage = STAGES.find(
  stage => process.env[`ONLY_${stage.toUpperCase()}`]
)

/**
 * Whether this build has `stage`'s pages
 * @param {'texts' | 'define' | 'nav' | 'site'} stage
 */
export function builds(stage) {
  return !buildStage || buildStage === stage
}
