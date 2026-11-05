# Gabriele Argentieri — Portfolio

Personal portfolio based on [Magic UI portfolio](https://github.com/magicuidesign/portfolio) (MIT), adapting the compact design of dillion.io and the earlier template revision bb8dd0a. Uses the current Next.js/React/Tailwind stack.

## Local development

Requires Node.js 22 and pnpm 10. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.

## GitHub Pages

`pnpm build` exports a static site to `out/`. In repository Settings → Pages, set Source to **GitHub Actions**. The included workflow builds and deploys on pushes to main/master. The built `/fete-cite/` site is preserved in `public/fete-cite/`; `/ig3d/` is copied into the deployment artifact. Legacy source files remain local. The canonical address is **https://gargenti.github.io**; `www.gargenti.github.io` is not the standard GitHub Pages hostname. No basePath is needed for this user-site repository.

Content lives in `src/data/resume.tsx`; page composition in `src/app/page.tsx`; visual styles in `src/app/globals.css`. The downloaded GitHub avatar lives in `public/avatar.png`. Project artwork is illustrative, not a screenshot of project outputs. No unpublished thesis results, publications, CUDA development or production-scale claims are attributed.
