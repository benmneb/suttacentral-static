[![SourceHut](https://img.shields.io/badge/-on_SourceHut-212529?logo=sourcehut&style=flat)](https://sr.ht/~benmneb/suttacentral-static)
[![Codeberg](https://img.shields.io/badge/-on_Codeberg-4793cc.svg?logo=codeberg&logoColor=white&style=flat)](https://codeberg.org/benmneb/suttacentral-static)
[![GitHub](https://img.shields.io/badge/-on_GitHub-010409.svg?logo=github&style=flat)](https://github.com/benmneb/suttacentral-static)

# 📚 [SuttaCentral.Express](https://suttacentral.express) [![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/benmneb/suttacentral-static/deploy-published-release.yml?style=flat&logo=github)](https://github.com/benmneb/suttacentral-static/actions/workflows/deploy-published-release.yml) [![HTML: checked](https://img.shields.io/badge/HTML-checked-green?logo=html5&logoColor=white&style=flat)](https://validator.w3.org/nu/?doc=https%3A%2F%2Fsuttacentral.express%2F) [![WCAG 2.2: AA target](https://img.shields.io/badge/WCAG_2.2-AA_target-green?style=flat)](ACCESSIBILITY.md)

## A fast and minimal alternative frontend for [SuttaCentral.net](https://suttacentral.net)

- Includes all sutta, vinaya and abhidhamma texts in their root languages, all English translations, footnotes, parallels, reference links and flexible text view settings
- Mirrors the URL structure of suttacentral.net. Just switch the `.net` for `.express`, or use the [browser extension](https://git.sr.ht/~benmneb/suttacentral-redirect) from the [Chrome](https://chromewebstore.google.com/detail/suttacentral-redirect/noaddajdfegpjfgpmbhcbahofgkceaan) or [Firefox](https://addons.mozilla.org/firefox/addon/suttacentral-redirect/) store
- W3C-valid HTML and schema.org-valid structured data, built and tested to WCAG 2.2 AA, with AAA contrast when more contrast is requested plus support for forced colours and reduced motion. See [ACCESSIBILITY.md](ACCESSIBILITY.md)
- Reads and navigates in older browsers, back to Chrome 109 and Firefox 115 on Windows 7 (from 2009). See the [principles](DEVELOPMENT.md#principles)
- Works offline with full functionality via desktop and Android apps, site archives and a [Kiwix](https://kiwix.org) ZIM file, all available for download in [Github](https://github.com/benmneb/suttacentral-static/releases/latest) and [Codeberg](https://codeberg.org/benmneb/suttacentral-static/releases/latest) releases

### Fast

- A first visit to `/mn1/en/sujato` transfers 91 KB here (a long sutta, about 6x the average), styles and scripts included, against 2.14 MB on SuttaCentral.net
- Readers here viewed about 4 pages each over the last 13 days, at 1.2 pages per visit. Even if every page were as long as MN 1, the average reader would take 8 months to load as much as .net does on its first page
- Every page is pre-built HTML, so the text comes with the first response, with no API calls, loading spinners or layout shift, except on the search results page. On [PageSpeed Insights](https://pagespeed.web.dev) for `/mn1/en/sujato` (desktop, 13/11/2026), Largest Contentful Paint was 7x faster (0.3s vs 2.1s), Total Blocking Time 94% lower (20ms vs 320ms), and Cumulative Layout Shift 100% lower (0 vs 0.3)

### Minimal

- No translations other than English
- No Javascript needed for reading any content or using any core-features. But if you want your settings to persist, to enable inline root-word lookup, to use the on-site text-to-speech or static search: enable JS

### Alternative

1. Typing `.express` vs `.net`: **+1.231 seconds** (38-40 WPM)
1. Faster page load: **−1.8 seconds** (using the most user-perceivable metric—Largest Contentful Paint)
1. The performance gain so dramatically outweighs the typing cost that you break even before you even finish loading the first page

### Frontend

This project uses the public SuttaCentral APIs at build time to generate a fully static site that displays their data minimally and accessibly. See [DEVELOPMENT.md](DEVELOPMENT.md) for how it's built and why, and [DEPLOYMENT.md](DEPLOYMENT.md) to deploy your own

## License

_Programmed for the purpose of pleasing people pursuing perfection_

Donated to the public domain via [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

Favicon via [thesunshade](https://github.com/thesunshade/citation-helper)

UI icons via [Heroicons](https://heroicons.com) by Tailwind Labs, MIT
