[![SourceHut](https://img.shields.io/badge/-on_SourceHut-212529?logo=sourcehut&style=flat)](https://git.sr.ht/~benmneb/suttacentral-static)
[![Codeberg](https://img.shields.io/badge/-on_Codeberg-4793cc.svg?logo=codeberg&logoColor=white&style=flat)](https://codeberg.org/benmneb/suttacentral-static)
[![GitHub](https://img.shields.io/badge/-on_GitHub-010409.svg?logo=github&style=flat)](https://github.com/benmneb/suttacentral-static)

# 📚 [SuttaCentral.Express](https://suttacentral.express) [![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/benmneb/suttacentral-static/deploy-published-release.yml?style=flat&logo=github)](https://github.com/benmneb/suttacentral-static/actions/workflows/deploy-published-release.yml)

## A fast and minimal alternative frontend for [SuttaCentral.net](https://suttacentral.net)

Includes all sutta, vinaya and abhidhamma texts in their root language, all English translations, all footnotes, parallels, main reference links and flexible text-view settings.

Mirrors the URL structure of suttacentral.net. Just switch the `.net` for `.express`, or use the [browser extension](https://git.sr.ht/~benmneb/suttacentral-redirect) from the [Chrome](https://chromewebstore.google.com/detail/suttacentral-redirect/noaddajdfegpjfgpmbhcbahofgkceaan) or [Firefox](https://addons.mozilla.org/firefox/addon/suttacentral-redirect/) store.

### Fast

Desktop performance comparison for `/dn1/en/sujato` via <https://pagespeed.web.dev> on 19/11/2025:

| &nbsp;                   | SuttaCentral.express | SuttaCentral.net | Performance Gain |
| ------------------------ | -------------------- | ---------------- | ---------------- |
| First Contentful Paint   | 0.3s                 | 0.6s             | 100% faster      |
| Largest Contentful Paint | 0.3s                 | 2.2s             | 633% faster      |
| Total Blocking Time      | 0ms                  | 160ms            | 100% reduction   |
| Cumulative Layout Shift  | 0                    | 0.643            | 100% reduction   |
| Speed Index              | 0.6s                 | 1.0s             | 67% faster       |

### Minimal

- No editions, essays, guides, map, testimonies, dictionaries, subjects, similes, names or terms pages—it’s just the tipitaka, Web 1.0 style.
- No translations other than English.
- No javascript needed for reading the texts, navigating between them, or adjusting view settings. If you want your view settings to persist, to use the on-site text-to-speech or static search, enable javascript.

### Alternative

Time to type 4 extra characters in `.express` vs `.net`:

- 4 characters ÷ 3.25 characters/second (38-40 WPM) = **1.231 seconds extra**

Time saved per page load (using the most user-perceivable metric - Largest Contentful Paint):

- 2.2s - 0.3s = **1.9 seconds saved per page load**

Number of page loads to break even:

- 1.231 ÷ 1.9 = **0.648 page loads**

You recoup the extra typing time for the longer URL after only 0.65 page loads.

The performance gain so dramatically outweighs the typing cost that you break even before you even finish loading the first page.

### Frontend

This project uses the public SuttaCentral APIs at build time to generate a fully static site that displays their data minimally and accessibly. See [DEVELOPMENT.md](DEVELOPMENT.md) for more info on hosting your own instance, it can take only 3 CLI commands.

## License

Donated to the public domain via [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
