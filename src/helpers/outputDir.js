/**
 * Output Dir
 *
 * Where the build writes what isn't a page, ie the hashed CSS and JS, lookup shards and images: Eleventy's output,
 * `_site` unless `--output` says otherwise. The config sets it before anything is written.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

export let outputDir = '_site'

/** @param {string} dir - Eleventy's `directories.output` */
export function setOutputDir(dir) {
  outputDir = dir
}
