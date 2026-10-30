# Accessibility

SuttaCentral Express aims to be usable by everyone, including people who use screen readers, keyboards, magnifiers, high contrast or other assistive technology.

## Standard

The site targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA. This is a goal the site is built and tested against, not a formal claim of conformance.

## How it's checked

These checks run on every release build, and a new release only deploys itself when they pass:

- Every page is valid HTML, with no errors or warnings from the [Nu validator](https://validator.w3.org/nu/) that W3C runs
- A sample of every kind of page has no problems [axe-core](https://github.com/dequelabs/axe-core) can find, by WCAG 2.2 A and AA and axe's best practices
- The sample is checked in light and dark mode, at a phone's width, and with more contrast, where it's held to AAA contrast too

The site also:

- Shows every text and core feature without JavaScript
- Follows the system's light or dark mode, contrast setting and forced colours
- Keeps motion to scrolling and panning, and leaves it out when reduced motion is set
- Has skip links on its pages

## Known limits

- Automated checks only find some kinds of problem, so passing them doesn't mean every page meets every criterion
- The texts, notes, dictionary entries and site pages come from [SuttaCentral](https://suttacentral.net)'s data. Their markup is tidied as the site is built, but there are nearly 140,000 pages, too many to review each by hand

## Feedback

If anything on the site is hard to use, please let me know in the [issue tracker](https://todo.sr.ht/~benmneb/suttacentral-static) (you can submit via email)
