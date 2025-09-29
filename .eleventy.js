import htmlmin from 'html-minifier-terser'

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('styles')

  const textTemplate = 'text.liquid'

  if (process.env.SKIP_TEXTS) {
    eleventyConfig.ignores.add(textTemplate)
    console.log('⏭️  Skipping text pages (SKIP_TEXTS enabled)')
  }

  if (process.env.ONLY_TEXTS) {
    eleventyConfig.ignores.add('index.liquid')
    eleventyConfig.ignores.add('pitaka.liquid')
    eleventyConfig.ignores.add('chapter.liquid')
    eleventyConfig.ignores.add('textMeta.liquid')
    eleventyConfig.ignores.add('_404.liquid')
    eleventyConfig.ignores.add('_robots.liquid')
    eleventyConfig.ignores.add('_sitemap.liquid')
    console.log('📄 Building only text pages (ONLY_TEXTS enabled)')
  }

  eleventyConfig.addFilter('endswith', function (str, suffix) {
    if (!str || !suffix) return false
    return str.endsWith(suffix)
  })

  eleventyConfig.addTransform('htmlmin', function (content) {
    if (!(this.page.outputPath || '').endsWith('.html')) return content

    // https://github.com/terser/html-minifier-terser?tab=readme-ov-file#options-quick-reference
    let minified = htmlmin.minify(content, {
      useShortDoctype: true,
      removeComments: true,
      collapseWhitespace: true,
    })

    return minified
  })

  return {
    dir: {
      input: 'pages',
      includes: '../includes',
      layouts: '../layouts',
      data: '../data',
    },
  }
}
