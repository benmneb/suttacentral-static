export default function (eleventyConfig) {
  return {
    dir: {
      input: 'pages',
      includes: '../_includes',
      data: '../_data',
      // output: "_site",
    },
  }
}
