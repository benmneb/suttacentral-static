## To run locally

1. Clone repo, install [Node](https://nodejs.org/en/download) then [PNPM](https://pnpm.io/installation)
1. Install packages: `pnpm i` (all commands should be run from the root directory)
1. Build site: `pnpm run dev:fresh` and practice patience while it hits over 100,000 SuttaCentral API's to get the data for the whole site, then builds it all. After fetching once it caches the data indefinitely
1. You now have a fully functioning local version of the site that works offline, with the latest data

## To contribute

See <https://todo.sr.ht/~benmneb/suttacentral-static> for inspiration, but note that this project is feature-complete and all future updates will be reserved for fixes/enhancements and to refresh the content

## To deploy

The fetching and the building together can take hours. The final build is 46,000+ HTML files and over 715mb. This is a lot of time, files and size, and the only free-tier I know that it works on for sure is Vercel. You just have to Build Locally, then Deploy Globally™

After the steps above, edit the `_siteMetaData.js` file appropriately, then run `pnpm run deploy`. Follow the prompts and you're done

Of course, if you have money, I’m sure you can find a way to automate it 🤑
