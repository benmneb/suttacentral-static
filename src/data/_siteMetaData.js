/**
 * Site Metadata Configuration
 *
 * Central configuration for site-wide metadata used throughout templates.
 * This is the primary file to edit when deploying your own instance of
 * this project.
 *
 * Imported into Eleventy templates as global data and used for:
 * - HTML meta tags (title, description, canonical URLs)
 * - JSON+LD, Open Graph and social media sharing
 * - Sitemap generation
 * - Links in footer
 *
 * @module SiteMetadata
 *
 * @returns {Object} Site metadata configuration
 * @returns {string} title - Site name displayed in browser tabs and meta tags
 * @returns {string} shortName - Short name for space-constrained places, ie mail subjects
 * @returns {string} slug - Filesystem-safe name for release archives and their folders
 * @returns {string[]} alternateNames - Other names the site goes by, for its structured data
 * @returns {string} description - Site description for search engines and social sharing
 * @returns {string} origin - Full site URL with protocol (e.g., 'https://example.com')
 * @returns {string} source - The site's source code repository
 * @returns {string[]} mirrors - Other copies of the `source` repository
 * @returns {{ src: string, attributes?: Object<string, string|boolean>, shareUrl?: string } | null} analytics - Analytics script loaded on every page, and its dashboard link in the footer; null to load neither
 * @returns {string} accessibility - Accessibility statement, linked from the footer
 * @returns {string} archive - The latest offline archive, linked from the footer
 * @returns {string[]} releases - Where the offline archive, ZIM and apps are published, for the archive README
 * @returns {string} contact - Contact email address for site inquiries/bug reports
 * @returns {string} [suggestions] - Where to send feedback, if not by `contact` email
 * @returns {{ name: string, url?: string }} maintainer - Who runs this instance, for its structured data, and the ZIM's publisher
 * @returns {string} pgpPublicKey - Fingerprint of the key `pnpm release:upload` signs release checksums with, if gpg has it
 * @returns {string} environment - Current build environment ('dev' or 'prod')
 *
 * @example
 * // To deploy your own instance:
 * // 1. Clone the repository
 * // 2. Edit this file with your site details
 * // 3. Run `pnpm install`
 * // 4. Run `pnpm build`
 * // 5. Deploy the `_site` folder to your web host
 */
export default function () {
  return {
    title: 'SuttaCentral Express',
    shortName: 'SCX',
    slug: 'scx',
    alternateNames: ['SuttaCentral.Express'],
    description: 'A fast and minimal alternative frontend for SuttaCentral.net',
    origin: 'https://suttacentral.express',
    source: 'https://sr.ht/~benmneb/suttacentral-static',
    mirrors: [
      'https://codeberg.org/benmneb/suttacentral-static',
      'https://github.com/benmneb/suttacentral-static',
    ],
    analytics: {
      src: 'https://stats.suttacentral.express/script.js',
      attributes: {
        async: true,
        'data-website-id': '480aa584-78e8-42ab-a911-e06bdb82a31f',
        'data-domains':
          'suttacentral.express,www.suttacentral.express,sxc.onl,www.sxc.onl',
        'data-exclude-search': 'true',
        'data-exclude-hash': 'true',
      },
      shareUrl: 'https://stats.suttacentral.express/share/4PY6ujsQ2Mxhz8d2',
    },
    accessibility:
      'https://git.sr.ht/~benmneb/suttacentral-static/tree/main/item/ACCESSIBILITY.md#accessibility',
    archive: 'https://codeberg.org/benmneb/suttacentral-static/releases/latest',
    releases: [
      'https://github.com/benmneb/suttacentral-static/releases',
      'https://codeberg.org/benmneb/suttacentral-static/releases',
    ],
    contact: 'feedback@suttacentral.express',
    // suggestions: 'https://todo.sr.ht/~benmneb/suttacentral-static',
    maintainer: { name: 'sankhato', url: 'https://sr.ht/~benmneb' },
    pgpPublicKey: 'AECABD60A4CB5BE900864AF2C8DAB4CE409C4AB8',
    environment: process.env.NODE_ENV || 'dev',
  }
}
