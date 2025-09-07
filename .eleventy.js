export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('styles')

  return {
    dir: {
      input: 'pages',
      includes: '../_includes',
      data: '../_data',
      // output: "_site",
    },
  }
}
