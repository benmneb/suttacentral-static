## To develop updates

- Be cautious. Running the dev server for the first time will hit over 100,000 SC API's, and they might not appreciate it. After that it caches the data indefinitely.
- See <https://todo.sr.ht/~benmneb/suttacentral-static> for inspiration

## To deploy updates

- Build locally with `pnpm run build`, then deploy the static files with `vercel deploy --prod --archive=tgz --cwd=_site` (locally because it fetches all data each time (whether from cache or remote), then builds over 46,000 HTML files, so takes hours and fails on vercels servers)
