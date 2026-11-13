[![SourceHut](https://img.shields.io/badge/-on_SourceHut-212529?logo=sourcehut&style=flat)](https://sr.ht/~benmneb/suttacentral-static)
[![Codeberg](https://img.shields.io/badge/-on_Codeberg-4793cc.svg?logo=codeberg&logoColor=white&style=flat)](https://codeberg.org/benmneb/suttacentral-static)
[![GitHub](https://img.shields.io/badge/-on_GitHub-010409.svg?logo=github&style=flat)](https://github.com/benmneb/suttacentral-static)

# 📚 [SuttaCentral.Express](https://suttacentral.express) [![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/benmneb/suttacentral-static/build-preview-release.yml?style=flat&logo=github)](https://github.com/benmneb/suttacentral-static/actions/workflows/build-preview-release.yml) [![HTML: checked](https://img.shields.io/badge/HTML-checked-green?logo=html5&logoColor=white&style=flat)](https://validator.w3.org/nu/?doc=https%3A%2F%2Fsuttacentral.express%2F) [![WCAG 2.2: AA target](https://img.shields.io/badge/WCAG_2.2-AA_target-green?style=flat)](ACCESSIBILITY.md)

## A fast and minimal alternative frontend for [SuttaCentral.net](https://suttacentral.net)

- Includes all sutta, vinaya and abhidhamma texts in their root languages, all English translations, footnotes, parallels, reference links and flexible text view settings
- Mirrors the URL structure of suttacentral.net. Just switch the `.net` for `.express`, or use the [browser extension](https://git.sr.ht/~benmneb/suttacentral-redirect) from the [Chrome](https://chromewebstore.google.com/detail/suttacentral-redirect/noaddajdfegpjfgpmbhcbahofgkceaan) or [Firefox](https://addons.mozilla.org/firefox/addon/suttacentral-redirect/) store
- W3C-valid HTML and schema.org-valid structured data, built and tested to WCAG 2.2 AA, with AAA contrast when more contrast is requested plus support for forced colours and reduced motion. See [ACCESSIBILITY.md](ACCESSIBILITY.md)
- Reads and navigates in older browsers, back to Chrome 109 and Firefox 115 on Windows 7 (from 2009). See the [principles](DEVELOPMENT.md#principles)
- Works offline with full functionality via desktop and Android apps, site archives and a [Kiwix](https://kiwix.org) ZIM file, all available for download in [Github](https://github.com/benmneb/suttacentral-static/releases/latest) and [Codeberg](https://codeberg.org/benmneb/suttacentral-static/releases/latest) releases

### Fast

- Every page is pre-built HTML, so the text comes with the first response, with no API calls, loading spinners or layout shift, except on the search results page
- On a mid-range Android with a weak or crowded mobile signal, like rural areas, a remote monastery or retreat centre, or a busy train (emulated as 400 kbps, 400 ms latency and a [mid-tier](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md#benchmarking-cpu-power) CPU), the opening of MN 1 is on screen in 2.6s here and 28.9s on SuttaCentral.net
- On [PageSpeed Insights](https://pagespeed.web.dev) for `/mn1/en/sujato` (desktop, 13/11/2026), Largest Contentful Paint was 7x faster (0.3s vs 2.1s), Total Blocking Time 94% lower (20ms vs 320ms), and Cumulative Layout Shift 100% lower (0 vs 0.3)

### Minimal

- English translations only
- No JavaScript needed to read any content or use any core feature. Turn it on to keep your settings, look up root words inline, listen with text-to-speech or search on the site

What a first visit transfers on each site, styles, scripts and fonts included, measured in headless Chrome with an empty cache on 13/11/2026:

| Page                 | SuttaCentral.express | SuttaCentral.net | Lighter by |
| -------------------- | -------------------- | ---------------- | ---------- |
| `/`                  | 20 KB                | 1.66 MB          | 83x        |
| `/mn1/en/sujato`     | 70 KB                | 2.13 MB          | 30x        |
| `/ma1/en/patton`     | 54 KB                | 1.94 MB          | 36x        |
| `/define/dhamma`     | 50 KB                | 2.09 MB          | 42x        |
| `/search?query=deva` | 123 KB               | 1.70 MB          | 14x        |

After its first page, .net runs as a single-page app, and each further sutta costs about the same on both sites, a few KB more here — unless .net needs a font it hasn't loaded yet, up to 20 MB for Chinese. It takes about 600 more suttas to make up the first-page gap, or about 6,000 if one of them has Chinese characters in it

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
