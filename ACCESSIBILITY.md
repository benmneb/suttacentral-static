# Accessibility

SuttaCentral Express aims to be usable by everyone, including people who use screen readers, keyboards, magnifiers, high contrast or other assistive technology.

## Standard

The site targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA. This is a goal the site is built and tested against, not a formal claim of conformance.

## How it's checked

Pages are checked by hand with a keyboard, at a phone's width, in light and dark mode, with more contrast and with forced colours. A screen reader has only been tried on a few of them.

These checks run on every release build, and a new release only deploys itself when they pass:

- Every page is checked with the [Nu HTML validator](https://validator.w3.org/nu/) that W3C runs, and only a few errors or warnings are let through, from slips in the API data that SuttaCentral provides
- A sample of every kind of page has no problems [axe-core](https://github.com/dequelabs/axe-core) can find, by WCAG 2.2 A and AA and axe's best practices
- The sample is checked in light and dark mode, at a phone's width, and with more contrast, where it's held to AAA contrast too

The site also:

- Shows every text and core feature without JavaScript
- Follows the system's light or dark mode, contrast setting and forced colours
- Keeps motion to scrolling and panning, and leaves it out when reduced motion is set
- Has skip links on its pages

## Known limits

- Automated checks only find some kinds of problem, so passing them doesn't mean every page meets every criterion
- Little of the site has been tried with a screen reader, so its markup and labels are checked by axe-core more than by use. Reports from screen reader users are especially welcome
- The texts, notes, dictionary entries and site pages come from [SuttaCentral](https://suttacentral.net)'s data. Their markup is tidied as the site is built, but there are nearly 140,000 pages, too many to review each by hand

## Feedback

If anything on the site is hard to use, please let me know via email: [accessibility@suttacentral.express](mailto:accessibility@suttacentral.express)
