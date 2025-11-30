/**
 * Metadata for the site
 */
export default function () {
  return {
    title: 'SuttaCentral Express',
    description: 'A fast and minimal alternative frontend for SuttaCentral.net',
    origin: 'https://suttacentral.express',
    host: 'suttacentral.express',
    contact: 'scx.judge565@simplelogin.com',
    environment: process.env.NODE_ENV || 'dev',
  }
}
