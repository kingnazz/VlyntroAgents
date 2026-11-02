# Agent HQ brand system

Visual source: `kingnazz/Vlyntro-codex`, branch `main`, inspected at commit `50e55c2bf1c1a3c54618bee2cb429d5a47c526cb`. The source repository was read only. Agent HQ has no runtime dependency on it.

The local BrandFace, mascot SVG, favicon, and Apple icon retain the source artwork. The lockup follows the current lowercase `vlyntro.` wordmark, with Agent HQ secondary. The mascot is reserved for login and the idle work state. Eye tracking is off in both uses; blinking is limited and reduced motion disables it.

`apps/web/src/brand/tokens.css` owns the warm paper, sand, card, ink, coral, sage, butter, and sky palette. `interface.css` applies it to the operational interface. Human activity and decisions use coral, agent action uses sky, success and live connections use sage, waiting uses butter, and failures use a restrained red. Identity accents do not override status colors. Offline and idle remain neutral.

Manrope and Parkinsans use local variable WOFF2 copies through `next/font/local`. These are the same Latin font assets served by the current Vlyntro site. Font licenses are included beside the files. Builds and browsers do not need Google Fonts or the marketing site to be reachable.

The console retains its existing data fetching, SSE events, mutations, permissions, routing, and API contracts. Reusable components live in `src/components`; detail views and Command Center live in `src/views`. No database or backend architecture changes are part of this release.

## Visual verification

Run the existing acceptance suite with `pnpm test:e2e`. Run the read-only brand matrix with `pnpm exec playwright test --config playwright.visual.config.ts`. It checks every primary view at 1440, 1280, 1024, 768, and 390 pixels, captures full-page screenshots, checks loaded typography, metadata and favicon, and rejects page overflow or browser errors. Use `VISUAL_OUTPUT_DIR` to select a protected local artifact directory.

For populated local review states, `pnpm exec tsx scripts/visual-fixtures.ts` creates a clearly identified local review task, approval, artifact, and mention. It refuses production or any database other than the local development cluster on port 55432. Never put demonstration history into production.

Screenshots and the machine-readable `verification.json` stay in ignored `output/playwright/` directories because authenticated views can contain private workspace content. Review both complete desktop/mobile captures and the five-width layouts before release.

Local release checks passed on November 1, 2026: formatting, lint, typecheck, all 40 Vitest tests, production build, three browser acceptance projects, and the five-width brand matrix against the production build. The matrix produced 88 screenshots: all 15 requested primary views at five widths, task/run details at five widths, and three collapsed-navigation captures. Desktop and mobile full-page captures and the intermediate-width viewport sheets were reviewed. No page overflow, browser errors, missing fonts, or old identity remnants were found.

Changed areas:

| Area                     | Files                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source artwork and fonts | `src/brand/BrandFace.tsx`, `Mascot.tsx`, `BrandLockup.tsx`, `fonts.ts`, `fonts/*`, `app/icon.svg`, `app/apple-icon.tsx`                                                   |
| Theme and metadata       | `src/brand/brand.ts`, `tokens.css`, `interface.css`, `app/globals.css`, `app/layout.tsx`, `next.config.ts`                                                                |
| Layout and reusable UI   | `src/console.tsx`, `src/login.tsx`, `src/components/*`                                                                                                                    |
| Operational views        | `src/views/command-center.tsx`, `channel.tsx`, `agent.tsx`, `task.tsx`, `run.tsx`, `blackboard.tsx`                                                                       |
| Review and deployment    | `tests/visual/brand.spec.ts`, `playwright.visual.config.ts`, `scripts/visual-fixtures.ts`, `compose.yaml`, `.env.example`, `.gitignore`, `docs/RUNBOOK.md`, this document |

Frontend paths in the table are relative to `apps/web`. Existing backend files and acceptance tests are unchanged.
