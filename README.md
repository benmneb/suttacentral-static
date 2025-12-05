[![SourceHut](https://img.shields.io/badge/-on_SourceHut-212529?logo=sourcehut)](https://git.sr.ht/~benmneb/suttacentral-static)
[![Codeberg mirror](https://img.shields.io/badge/-on_Codeberg-4793cc.svg?logo=codeberg&logoColor=white)](https://codeberg.org/benmneb/suttacentral-static)
[![GitHub mirror](https://img.shields.io/badge/-on_GitHub-010409.svg?logo=github)](https://github.com/benmneb/suttacentral-static)

# 📚 [SuttaCentral.Express](https://suttacentral.express)

## A [fast](#fast) and [minimal](#minimal) alternative frontend for [SuttaCentral.net](https://suttacentral.net)

Includes all the English and root language tipitaka texts (suttas, vinaya, abhidhamma) and their footnotes/variants, parallels, main reference/segmentation links, and root-text views, where applicable.

Mirrors the URL structure of suttacentral.net. Just switch the `.net` for `.express` in the URL.

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
- No javascript needed for reading the texts, navigating between them, or adjusting view settings. If you want to your view settings to persist, to use the in-site text-to-speech or search, enable javascript.

### Alternative

Average typing speed: 38-40 WPM (195 characters per minute, that's 3.25 characters per second)

Time to type 4 extra characters in `.express` vs `.net`:

- 4 characters ÷ 3.25 characters/second = **1.231 seconds extra**

Time saved per page load (using the most user-perceivable metric - Largest Contentful Paint):

- 2.2s - 0.3s = **1.9 seconds saved per page load**

Number of page loads to break even:

- 1.231 ÷ 1.9 = **0.648 page loads**

Each user recoups the extra typing time for the longer URL after only 0.65 page loads.

The performance gain so dramatically outweighs the typing cost that each user breaks even before they even finish loading the first page.

### Frontend

This project uses the public SuttaCentral APIs at build time to generate a fully static site that displays their texts data minimally and accessibly. See DEVELOPMENT.md for more info on hosting your own instance, it can take only 3 CLI commands.

## License

Donated to the public domain via [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
