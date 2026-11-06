/**
 * The page minifier.
 *
 * Its whitespace squeeze is only there for speed, so a page must come out the same with it as without.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import htmlmin from 'html-minifier-terser'
import {
  minifyHtmlCode,
  squeezeLineBreaks,
} from '../src/helpers/minifyAssets.js'

const page = `<!DOCTYPE html>
<html>
  <body>
    <p>
      <span class="segment">One</span>


      <span class="segment">two</span>   <b>three</b>
    </p>
    <pre>
  kept
      as is
</pre>
    <script type="application/ld+json">
      { "name": "kept" }
    </script>
    <textarea>
  kept</textarea>
  </body>
</html>
`

describe('Page minifier', () => {
  it('squeezes each run with a line break to one', () => {
    assert.equal(
      squeezeLineBreaks('<p>\n      <b>a</b>  \n\n   <i>b</i> <u>c</u></p>'),
      '<p>\n<b>a</b>\n<i>b</i> <u>c</u></p>'
    )
  })

  it('leaves pre, script and textarea whitespace as it is', () => {
    const squeezed = squeezeLineBreaks(page)
    assert.ok(squeezed.includes('<pre>\n  kept\n      as is\n</pre>'))
    assert.ok(squeezed.includes('\n      { "name": "kept" }\n    </script>'))
    assert.ok(squeezed.includes('<textarea>\n  kept</textarea>'))
  })

  it('minifies a page the same as without the squeeze', async () => {
    assert.equal(
      await minifyHtmlCode(page),
      await htmlmin.minify(page, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
      })
    )
  })
})
