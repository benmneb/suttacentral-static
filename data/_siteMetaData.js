/**
 * Site Metadata Configuration
 *
 * Central configuration for site-wide metadata used throughout templates.
 * This is the primary file to edit when deploying your own instance of
 * this project.
 *
 * Imported into Eleventy templates as global data and used for:
 * - HTML meta tags (title, description, canonical URLs)
 * - Open Graph and social media sharing
 * - Sitemap generation
 * - Links in footer
 *
 * @module SiteMetadata
 *
 * @returns {Object} Site metadata configuration
 * @returns {string} title - Site name displayed in browser tabs and meta tags
 * @returns {string} description - Site description for search engines and social sharing
 * @returns {string} origin - Full site URL with protocol (e.g., 'https://example.com')
 * @returns {string} host - Domain name without protocol (e.g., 'example.com')
 * @returns {string} contact - Contact email address for site inquiries/bug reports
 * @returns {string} environment - Current build environment ('dev' or 'prod')
 *
 * @example
 * // To deploy your own instance:
 * // 1. Clone the repository
 * // 2. Edit this file with your site details
 * // 3. Run `pnpm install`
 * // 4. Run `pnpm run build`
 * // 5. Deploy the `_site` folder to your web host
 */
export default function () {
  return {
    title: 'SuttaCentral Express',
    description: 'A fast and minimal alternative frontend for SuttaCentral.net',
    origin: 'https://suttacentral.express',
    host: 'suttacentral.express',
    source: 'https://git.sr.ht/~benmneb/suttacentral-static',
    analytics: 'https://dashboard.simpleanalytics.com/suttacentral.express',
    archive: 'https://codeberg.org/benmneb/suttacentral-static/releases/latest',
    contact: 'scx.judge565@simplelogin.com',
    environment: process.env.NODE_ENV || 'dev',
  }
}
