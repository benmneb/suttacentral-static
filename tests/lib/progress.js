/**
 * Progress
 *
 * A count on stderr for the slow parts of the tests, as the test runner only
 * reports a test once it's finished. Only the first and last lines when
 * stderr isn't a terminal, ie in CI.
 */

import ora from 'ora'

/**
 * Starts counting, ie `Validating the HTML: 4,000 of 138,709 pages`
 * @param {string} label
 * @param {number} total
 * @param {string} unit - What's counted
 */
export function progress(label, total, unit = 'pages') {
  let done = 0
  const text = () =>
    `${label}: ${done.toLocaleString('en')} of ${total.toLocaleString('en')} ${unit}`
  const spinner = ora(text()).start()
  spinner.spinner = { frames: ['⏳'] }
  return {
    /** Counts some more done */
    add(count = 1) {
      done += count
      spinner.text = text()
    },
    /** Stops, with a tick if everything was done, else a cross */
    end() {
      if (done >= total) spinner.succeed(text())
      else spinner.fail(text())
    },
  }
}
