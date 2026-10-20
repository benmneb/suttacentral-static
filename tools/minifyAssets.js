/**
 * Minify Assets
 *
 * Minifies the CSS and JavaScript into `_site` without a full Eleventy build:
 *
 *   pnpm minify:css      // CSS only
 *   pnpm minify:js       // JS only
 *   pnpm minify:assets   // Both
 */

import { minifyCss, minifyJs } from '../src/helpers/minifyAssets.js'

const arg = process.argv[2]

try {
  if (!arg || arg === 'all') {
    await minifyCss()
    await minifyJs()
  } else if (arg === 'css') {
    await minifyCss()
  } else if (arg === 'js') {
    await minifyJs()
  } else {
    console.error('Unknown arg. Use `css`, `js`, or `all`')
    process.exit(2)
  }
} catch (e) {
  console.error('Error while minifying assets:', e)
  process.exit(1)
}
