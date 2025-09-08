import CleanCSS from 'clean-css'
import postCss from 'postcss'
import autoPrefixer from 'autoprefixer'
import postCssNesting from 'postcss-nesting'

export default function (eleventyConfig) {
  eleventyConfig.addFilter('postcss', async function (code) {
    const result = await postCss([postCssNesting, autoPrefixer]).process(code, {
      from: undefined,
    })
    return new CleanCSS({}).minify(result.css).styles
  })

  return {
    dir: {
      input: 'pages',
      includes: '../_includes',
      data: '../_data',
      // output: "_site",
    },
  }
}
