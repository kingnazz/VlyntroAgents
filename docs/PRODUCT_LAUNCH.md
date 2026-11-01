# Vlyntro Agents public launch

The product is Vlyntro Agents. The authenticated workspace is Agent HQ. The frontend release adds a public website without changing API, worker, database, MCP, or SSE contracts.

## Routing and authentication

| Request                        | Result                                 |
| ------------------------------ | -------------------------------------- |
| Anonymous or authenticated `/` | Public product website, HTTP 200       |
| Anonymous `/app`               | HTTP 307 to `/login`                   |
| Authenticated `/app`           | Agent HQ                               |
| Anonymous `/login`             | Secure login                           |
| Authenticated `/login`         | HTTP 307 to `/app`                     |
| Successful sign-in             | `/app`                                 |
| Sign out                       | `/login`, existing session invalidated |

`src/session.ts` validates the existing opaque session through `/api/v1/auth/me` with no caching. An invalid cookie does not grant access. API unavailability shows the existing reconnect state without rendering private workspace content. Internal query navigation and linked tasks/runs use `/app?view=…`. REST remains `/api/v1/*`, SSE remains `/api/v1/stream`, and MCP remains `/mcp`.

## Public product site

`apps/web/src/marketing` contains the navigation, hero, product previews, capability explorer, problem comparison, workflow, human control, agents, command center, conversation, use cases, controlled deployment explanation, closing CTA, and footer. Layout and explanatory content use Server Components; small client islands handle navigation and demos.

Visual source: `kingnazz/Vlyntro-codex/main`, verified at `50e55c2bf1c1a3c54618bee2cb429d5a47c526cb`. Existing BrandFace, mascot, Manrope, Parkinsans, color tokens, shape semantics, and Agent HQ components are reused. The social image uses local ASCII subsets of the same fonts in TTF format because ImageResponse does not support WOFF2; their original licenses remain beside them.

Messages, panels, avatars, status badges, and approval styling share the application primitives. Demo records are local presentation data. Demo interactions make no API mutations and do not create database records. Provider labels use neutral existing icons. Workflow patterns and policy examples explain which external actions need deployment-specific configuration; they do not promise prebuilt publishing, outreach, or production deployment integrations. No pricing, testimonials, customer logos, or unverified metrics were added.

## Conversion and SEO

Request Access points to `https://vlyntro.com/contact?build=Agent%20or%20workflow`. This is the existing Vlyntro contact flow and supported preselection. The live destination was opened and the selected build type verified. No inquiry was submitted during QA. No public registration or new contact backend was introduced.

The homepage is static and indexable, with the requested title, description, exact canonical `https://agents.vlyntro.com/`, branded Open Graph image, and Twitter summary image. The sitemap lists only the homepage. Robots excludes app, login, API, and MCP paths. App and login also have explicit noindex metadata, X-Robots-Tag, and private/no-store responses.

## Verification and release procedure

Run lint, typecheck, all Vitest tests, the production build, the browser acceptance suite, and the five-width visual matrix. The routing test covers every route/session case above, invalid-session denial, API/MCP denial, and logout invalidation. The marketing matrix exercises navigation, capability tabs, demo approval/replay, example task details, conversion links, metadata, and overflow at 390, 768, 1024, 1280, and 1440 pixels. The Agent HQ matrix covers channels, agents, tasks, approvals, runs, artifacts, Blackboard, activity, settings, and task/run details.

Browser checks reserve API request capacity between flows to respect the existing production rate limiter. The limiter itself is unchanged. Screenshots and verification JSON stay in ignored `output/playwright/` because app captures can contain private content.

Local release checks passed on November 1, 2026: ESLint, formatting, typecheck, all 40 Vitest tests, the production build, all six acceptance tests (desktop, tablet, mobile), and both five-width visual suites. A separate routing check also passed against the standalone production server. Final Lighthouse mobile scores were performance 98, accessibility 100, best practices 100, and SEO 100. Desktop/mobile marketing and login captures, intermediate-width hero layouts, workflow/control/command center captures, and the social image were reviewed. Application and marketing screenshots use separate directories to avoid filename collisions.

Deploy only the web image using `WEB_IMAGE_TAG` and `docker compose up -d --no-deps --wait web`. Preserve the previous tag for rollback. Compare API, worker, PostgreSQL, and Caddy container IDs before and after. Do not run migrations or seeds for this release. Record production verification in the release handoff.

## Existing operational limitation

Live model execution depends on configured provider credentials and the optional controlled Codex command adapter. The previously deployed installation reports these execution agents offline. This frontend release does not configure providers or add integrations. The product can be demonstrated through clearly labeled public examples and requested through Vlyntro's existing inquiry flow.
