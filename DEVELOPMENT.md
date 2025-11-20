## To develop updates

- Good luck.

## To deploy updates

- Build locally with `pnpm run build`, then deploy the static files with `vercel deploy --prod --archive=tgz --cwd=_site`
- It fetches all data each time, then builds over 46,000 HTML files, so takes hours and fails on vercels servers
