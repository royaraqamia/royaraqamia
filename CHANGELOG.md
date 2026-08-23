# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.10.0] - 2026-08-23

### Changed
- bump motion from 12.42.2 to 13.1.1
- bump jsdom from 29.1.1 to 30.0.1
- bump the minor-and-patch group with 43 updates
- bump actions/upload-artifact from 4.6.2 to 7.0.1
- bump actions/cache from 4.3.0 to 6.1.0
- remove unused specs
- enable optional native push round-trip via PUSH_E2E secret
- remove inaccurate dependabot comment
- group dependabot minor and patch updates
- enforce conventional PR titles and lint workflow files
- add concurrency and sane timeout to CodeQL analysis
- harden security scan with concurrency, timeouts and weekly full audit
- abort release when tested commit is no longer HEAD
- add Playwright E2E workflow against production build
- split code quality pipeline into parallel jobs with concurrency control
- cache Next.js build artifacts in shared setup action
- add PUSH_E2E-gated native push round-trip spec
- also revoke sweep execute from authenticated
- weekly sweep of stale push subscriptions
- remove completed features plan and scratch file list

### Added
- keep push delivery diagnostics in the service worker
- prune superseded device rows and track endpoint liveness

### Fixed
- refresh subscription liveness on site visits
- persist push opt-out where the service worker can read it
- re-subscribe inside the service worker on endpoint rotation

## [1.9.0] - 2026-08-22

### Changed
- remove rounded badge pills above hero, features, how-it-works and CTA sections
- static glow orbs, drop wasted blurs, narrow transitions, RSC sections
- eliminate overlay jank in dialogs, sheets, dropdowns and toasts

### Added
- render all sections on page entry instead of lazily on scroll

### Fixed
- raise horizontal scroll arrows above card layers so they stay clickable

## [1.8.0] - 2026-08-22

### Changed
- remove blog page subtitle and search suspension
- optimize hero glow orbs and regenerate favicon (smaller .ico, subset fonts)
- add cv-auto for long-form content and cleanup PWA manifest duplication
- remove animate-pulse from static GlowOrb in landing heroes
- code-split dashboard+admin panels and bulk url shortener in linksnap
- convert motion to m in habitflow dashboard and stats-card
- convert Motion components to m/runtime primitives across UI library
- replace backdrop-blur with static fills in UI primitives and navbar
- add blur budget tokens and CSS reveal for LCP optimization
- add minimumCacheTTL for optimized image CDN caching
- subset Arabic fonts and optimize favicon sizes

### Added
- add edge-cacheable Cache-Control header for version endpoint

## [1.7.9] - 2026-08-21

### Changed
- remove always-on ambient drift animations from landing
- drop decorative backdrop-filters on flat landing surfaces
- remove brand name from email subjects

### Fixed
- drop custom legal-page backgrounds and tokenize to main theme
- restore spacing lost with global heading margins

## [1.7.8] - 2026-08-21

### Changed
- drop utilities colliding with Tailwind core
- route simple animations through LazyMotion m component
- drop unused wa-bounce keyframes; cap whatsapp pulse ring
- scope transitions to animated properties on legal pages
- run functions in dub1 next to Supabase eu-west-1
- skip version polling while tab is hidden
- drop decorative backdrop-filter on flat backgrounds
- consolidate ambient glow blurs into shared tiers

### Fixed
- remove global heading margins breaking flex centering
- show verified badge on mobile and harden dialog footer spacing
- stop caching no-store API responses
- remove duplicate sw.js cache-control definition
- cap function duration to bound hung SSE streams

## [1.7.7] - 2026-08-20

### Fixed
- redirect unauthenticated consent visitors without a base URL
- use refreshSession for user-scoped client and persist rotated token

## [1.7.6] - 2026-08-20

### Fixed
- allow OAuth loopback callbacks on any port via form-action port wildcards

## [1.7.5] - 2026-08-20

### Changed
- use 302 for OAuth error redirects, prefer getUser() for identity, and drop the scope list from the consent page

### Fixed
- redirect consent to the client callback with a 302 GET and allow loopback form-action

## [1.7.4] - 2026-08-20

### Changed
- approve install scripts for @sentry/cli and esbuild
- rename middleware.ts to proxy.ts for Next 16
- remove decorative header/footer branding and unify font to IBM Plex Sans Arabic
- subscribe to auth session once instead of on every navigation
- limit syntax highlighting to a lean language set
- throttle reading progress updates with requestAnimationFrame
- promote animated glow orbs to compositor layers with mobile blur caps
- memoize testimonial cards and precompute card metadata
- restrict product dialog animations to transform
- animate overlay primitives with transform and opacity only

### Fixed
- nest staleTimes under experimental and skip Sentry plugin outside Vercel
- pass rehypeHighlight as a plugin tuple to fix prerender crash
- retry transient web-push failures with exponential backoff
- serve well-known discovery routes with the standard Response API
- send landing CTA logins straight to the product dashboard
- preserve current path as redirect target on navbar login link
- shrink grid columns on narrow screens and show single star

## [1.7.3] - 2026-08-20

### Changed
- add supabase CLI as devDependency

### Fixed
- preserve redirect target across login flows and MCP connect
- validate redirect_uri before OAuth error redirects

## [1.7.2] - 2026-08-20

### Changed
- bump react-dom and @types/react-dom
- Potential fix for code scanning alert no. 31: DOM text reinterpreted as HTML
- bump @radix-ui/react-radio-group from 1.4.4 to 1.4.7
- bump @radix-ui/react-navigation-menu from 1.2.18 to 1.2.22
- bump marked from 18.0.7 to 18.0.9
- bump @types/node from 26.1.2 to 26.2.0
- bump @tiptap/core from 3.29.0 to 3.30.1
- bump @tiptap/extension-link from 3.29.0 to 3.30.1
- bump react and @types/react
- bump @tiptap/pm from 3.29.0 to 3.30.1
- bump lucide from 1.30.0 to 1.31.0
- bump softprops/action-gh-release from 2 to 3

## [1.7.1] - 2026-08-19

### Fixed
- import NextResponse in OAuth discovery routes

## [1.7.0] - 2026-08-19

### Changed
- apply prettier formatting to workflow, docs, and eslint config
- restyle OTP, reset, and broadcast templates
- refresh generated app version
- apply prettier formatting

### Added
- challenge anonymous MCP requests with OAuth 401
- add admin certificate tools and document MCP encryption key
- add per-user write tools for user products
- add read-only MCP tools for user products
- add stateless streamable HTTP transport and tools registry
- add OAuth authorization server HTTP endpoints
- add OAuth 2.1 provider with PKCE, code exchange, and refresh rotation
- add scope model and session resolution for user-scoped access
- add OAuth tables, token crypto, and oauth repository
- add channel toggles to announcement composer
- add broadcast API client for combined channel sends
- add broadcast endpoint supporting notification and email channels
- add EmailBroadcastService and fail-safe admin broadcaster
- resolve recipient emails via admin users service
- add broadcast email contract and batch email client

### Fixed
- default sender name to رؤية رقمية when RESEND_FROM_NAME is missing
- use permissive batch validation so one bad address can't fail the whole broadcast
- make Turnstile responsive on narrow screens and match primary theme

## [1.6.1] - 2026-08-19

### Changed
- remove decorative section eyebrow badges
- simplify testimonial card and dialog layout
- remove role from testimonials
- split dropdowns out of initial desktop chunk
- preload Aref Ruqaa to shorten LCP
- reserve hero-visual footprint to kill CLS

### Fixed
- make lazy-section anchors scroll to the mounted section
- stop card override from painting opaque panels on text
- match reserved hero-visual height to measured footprint

## [1.6.0] - 2026-08-18

### Changed
- harden calendar grid for production
- drop route-scoped CSS, restore single Tailwind compilation

### Added
- extract calendar formatting helpers with unit tests

### Fixed
- harden testimonials carousel a11y and strict typing
- harden link edit dialog a11y and submit guards
- responsive link edit dialog with internal scroll
- consistent scrollable dialog content across products
- restore perf_indexes_and_search migration filename to match remote

## [1.5.0] - 2026-08-18

### Changed
- align local migration timestamps with remote
- update cross-cutting feature statuses (Phase 5/6 complete)
- defer preload of decorative Aref Ruqaa logo font
- add route-scoped CSS guardrail script
- extract shared Tailwind @theme into app/theme.css
- lazy-load below-the-fold sections to shrink initial JS
- remove root loading boundary for direct HTML paint
- serve /_next/image responses stale-while-revalidate
- inline design-tokens.css to drop a render-blocking request
- trim font preloads and lazy-load portfolio images

### Added
- add new testimonial and update existing one - Add new testimonial from شهد الحسن (متدربة - دورة UI/UX) - Update existing testimonial from نصرات الحلاق with minor formatting adjustment
- save on Cmd/Ctrl+S in the editor
- announce active page in mobile nav links
- optimistic toggle with snapshot rollback
- route-scope Tailwind CSS per product with scoped entries
- add undo toasts for destructive actions
- add Cmd+K quick-create actions across products
- add category splits and per-expense currency
- add CSV export and streak-frozen recovery nudges
- add password-protected short links with unlock flow
- add post export (markdown/html), duplicate, and editor reading progress
- add live slug availability check and re-slugging
- add per-row share sheet with copy fallback

### Fixed
- attach scoped CSS to unlock flow via route move and rewrite
- restore corrupted Arabic text in product FeaturesBento sections

## [1.4.4] - 2026-08-17

### Changed
- remove dead motion-only classes from global.css
- make /blog statically prerendered with client-side search island
- lazy-mount RoyaToaster and defer sonner to a separate chunk
- replace framer-motion reveal islands with IO + CSS animations
- convert product landing pages to RSC + client islands
- add reveal/CTA islands and CSS-driven landing animations
- lazy-load user and notification dropdowns
- on-demand tag revalidation for public cache
- trim feed payload with stored reading time
- allow edge caching on public pages and add client staleTimes

### Fixed
- show update popup only on release version with 30-min reminder
- circle-crop app icons and add proper maskable/badge assets

## [1.4.3] - 2026-08-17

### Changed
- add rounded-full to logo in navbar and footer
- optimize public page images with next/image and AVIF

### Fixed
- use square brand logo for PWA icons and circular favicon

## [1.4.2] - 2026-08-17

### Changed
- server-render static landing sections with client islands
- lazy-mount root layout floats off critical path

### Fixed
- auto re-subscribe after VAPID key rotation

## [1.4.1] - 2026-08-17

### Changed
- refine issued-certificate notification copy
- honor prefers-reduced-motion on landing glows
- skip auth user fetch on public pages
- pre-render verify pages at build with ISR
- update push endpoint allowlist expectation for google.com hosts
- align recipient_user_ids migration version with remote

### Fixed
- allow modern Chrome FCM endpoints on google.com hosts

## [1.4.0] - 2026-08-17

### Changed
- remove superseded admin-user-targeting plan
- stream dashboard sections and dedupe loaders
- dedupe per-request supabase client construction
- fold post tags into cached post payload
- add blog feed and admin dashboard serving indexes

### Added
- add NextSupa perf architect subagent

### Fixed
- notify newly attached recipients when editing a certificate

## [1.3.0] - 2026-08-17

### Changed
- add plan for admin user targeting in certificates and notifications
- align announcement body length with server cap

### Added
- add multi-select user picker to certificate and announcement forms
- persist and notify targeted recipients by user id
- support targeted admin announcement recipients
- add searchable admin users API
- add admin user selection schemas and recipient_user_ids
- add recipient_user_ids column and regenerate types

### Fixed
- strip internal recipient fields from public verify endpoints

## [1.2.1] - 2026-08-16

### Changed

- Correct release versioning retroactively: v1.0.1-v1.0.6 were graded from the
  single tip commit before each tag (pre-fix `release-tools.mjs --next`), which
  released the 49-feature window under v1.0.1 and the 11-feature push window
  under v1.0.6 as patch bumps. Replaying the corrected "grade across all
  commits since last tag" logic over the actual release windows yields 1.1.0,
  1.1.1, 1.1.2, 1.1.3, 1.1.4, 1.2.0, and 1.2.1. This release realigns the
  committed version to that estimated value; historical tags stay untouched.
- add `npm run version:replay` — read-only audit that re-grades every release
  window from git history and prints the true accumulated version.

## [1.0.7] - 2026-08-16

### Changed
- ignore CHANGELOG, package.json, and generated app-version in prettier

### Fixed
- keep push disabled when toggled off
- grade next version across all commits since last tag

## [1.0.6] - 2026-08-16

### Changed
- apply prettier formatting
- add web-push for OS-level push notifications

### Added
- add habit reminder push webhook endpoint with per-user daily dedupe
- dispatch habit reminders to the app webhook via pg_net
- add browser subscription client and notification dropdown toggle
- handle push events and notification clicks in the service worker
- add subscribe/unsubscribe API with CSRF guard and rate limit
- wire push dispatch into notification producers and admin broadcaster
- add PushService with VAPID dispatch, allowlist, and endpoint pruning
- add push subscriptions repository with chunked dispatch reads
- add shared push subscription contract and URL mapping
- add push_subscriptions table, RLS policies, and generated types
- add VAPID env config and key generator script

### Fixed
- treat blank PUSH_ENDPOINT_ALLOWLIST as unset
- harden webhook fan-out, click handling, and subscribe rollback
- revoke authenticated execute on habit reminder push webhook
- align push migration filenames with applied remote versions
- load web-push via default import in generate-vapid script

## [1.0.5] - 2026-08-16

### Changed

- apply prettier formatting
- apply prettier formatting
- bump @radix-ui/react-context-menu from 2.3.3 to 2.3.7
- bump typescript-eslint from 8.65.0 to 8.66.0
- bump @radix-ui/react-menubar from 1.1.21 to 1.1.24
- bump @radix-ui/react-checkbox from 1.3.7 to 1.3.11
- bump @tiptap/react from 3.29.0 to 3.29.2
- bump react-hook-form from 7.83.0 to 7.84.0
- bump prettier from 3.6.2 to 3.9.6
- bump @tiptap/extension-image from 3.29.0 to 3.29.2
- bump @supabase/ssr from 0.12.3 to 0.12.4
- bump @types/node from 26.1.1 to 26.1.2

## [1.0.4] - 2026-08-13

### Changed

- apply prettier formatting
- clean up certificate verification page
- simplify certificate QR code display

## [1.0.3] - 2026-08-13

### Changed

- apply prettier formatting
- cache certificate-by-code lookups

### Fixed

- harden certificate verification page (a11y, reduced motion, clipboard)
- use timezone-safe certificate expiry check

## [1.0.2] - 2026-08-12

### Changed

- apply prettier formatting
- simplify version support policy to current production release

### Fixed

- keep package-lock.json in sync with package.json during releases

## [1.0.1] - 2026-08-12

### Changed

- Update
- supply SUPABASE_SERVICE_ROLE_KEY to build job
- Update
- Update
- Update
- Update
- drop 6.9MB of fallback PNGs and shrink favicon to 8KB
- cache post slug, tags, and categories for 60s
- bound analytics and admin events to 10k rows / 100 links
- defer recharts dashboard charts behind Suspense
- lazy-load qrcode and canvas-confetti on interaction
- Update
- remove @phosphor-icons/react after Lucide migration
- migrate remaining UI icons from Phosphor to Lucide
- render product landing pages as server components
- batch post tags into a single query to eliminate N+1
- static-generation slugs and cache public blog queries for 60s
- additive serving indexes for analytics, notifications, habit logs, and ILIKE search
- mark spendtrack CSV and undo as done
- migrate Hero/HeroVisual/WhyUs icons to Lucide
- migrate auth pages icons from Phosphor to Lucide
- mark done blogpress bulk/calendar and spendtrack insights
- Update
- move ambient motion loops to compositor-only CSS animations
- paint hero LCP text without waiting for hydration
- render static marketing sections as Server Components
- lazy-load supabase client off static pages
- disable client session replay runtime
- unify loading to single page loader across all routes
- cache immutable assets and add noise overlay source
- remove unused OG Image png source
- serve woff2 instead of uncompressed ttf and drop unused weights
- skip supabase round-trip for anonymous public requests
- remove dead numbered png assets and unused png field
- Update
- format analytics-repository
- Update
- Update
- Update
- bump @radix-ui/react-tooltip from 1.2.13 to 1.2.16
- bump @radix-ui/react-hover-card from 1.1.15 to 1.1.23
- Potential fix for code scanning alert no. 26: Insecure temporary file
- Potential fix for code scanning alert no. 22: Insecure temporary file
- add per-project agent contract for automatic skill execution
- mock admin-auth-guard in route tests after announcement controller import
- apply prettier formatting to pending-login store and notification test
- drop unused React import to satisfy typecheck
- remove orphaned theme-provider (zero importers, not mounted in any layout)
- surface corrupted data-file reads instead of failing silently
- tighten category casts to single DB-domain assertion
- satisfy prettier on refactored files
- move loader-visible repository result/query types into shared/contracts
- rename nested ui/ui primitives folder to ui/primitives
- split logger into per-side leaf utilities (backend/shared + frontend/shared)
- move admin-validator leaf utility from root shared/ to backend/shared/
- move leaf UI hooks from state/ to shared/ (no API dependency)
- satisfy prettier
- update README to reflect architectural changes
- replace all console.error/console.warn with structured logger
- remove I-prefix from 12 repository interfaces
- wrap AUTH_PATHS array for readability
- convert CertificateVerifier arrow function properties to regular methods
- rename color_hex to colorHex in Spendtrack application types
- convert LinksnapApiClient class with all-static methods to module of exported functions
- convert AdminValidator class with static methods to plain exported function
- deduplicate formatDateArabic into formatHijriDate and extract CERT_CODE_REGEX
- remove dead exports and unused validation schemas
- route session provider through api layer
- delegate all request validation to services, thin the controller
- move generic AppError out of habitflow-named module into shared errors
- make controller thin by moving validation and local-data into service
- apply prettier formatting to auth, admin repository and email client
- extract server-side data loaders so pages stay pure presentation
- centralize NODE_ENV checks in frontend env module
- move middleware DB writes and route maps into repositories/config
- move public users upsert out of gateway into a repository
- inject email validity TTLs from config instead of hardcoding copy
- move turnstile bypass decision from client to config
- move habitflow window defaulting and typed validation into service
- delegate rate-limit policies and reserved-code rule to config/service
- compose supabase clients in config root, inject into repositories
- move PendingLoginStore contract to shared leaf so transport no longer imports services
- satisfy prettier
- compose admin posts service in config instead of transport in blog page
- move errorResult error mapping out of transport into middleware
- extract shared HeroSection shell
- remove dead http response helpers and controller transport leak
- extract shared HowItWorksSection shell
- extract route-handler logic into backend/controllers
- extract shared FeaturesSection shell
- dedupe FeaturesBento card theme via shared helper
- move admin-visibility decision from controllers into service
- lift rate-limit policies from controllers into config
- move redirect code-filter and error classification into service
- route VersionChecker through api layer instead of transport
- inject db path into JsonFileHabitRepository instead of importing config
- centralize all env reads in backend/config/env and frontend/shared/constants
- move session provider to state layer, fix reverse ui dependency
- generalize subscribeToPostgresChanges; route through notifications api layer
- compose AuthGateway in config via createServerAuthService helper
- move pending_login cookie handling into AuthService via PendingLoginStore
- prettier formatting for spendtrack page and notifications repository
- kebab-case hook file names (useFocusTrap, useHorizontalScroll)
- move backup/restore orchestration out of route handlers into service
- dedupe createClient(cookieStore) via loadSpendtrackService helper
- map DB rows to contract types instead of double casts
- route Google OAuth users upsert through AuthGateway client
- centralize Turnstile site key config in constants
- move analytics ownership check from repository to service
- move verification workflow out of repository into AuthService
- move data-path out of shared into config and resolve lazily
- split editor-content god component into autosave/upload hooks and toolbar/settings components
- split repository interface into reader/writer (ISP)
- extract realtime channel wiring into transport layer
- derive wire DTOs from shared contract types instead of duplicating fields
- inject siteUrl into AuthService instead of reading env in the service
- move supabase client construction from repository to composition root
- reformat import lines to satisfy prettier
- flatten habitflow feature island into shared layer folders
- move reading-time utility out of root shared into frontend shared
- move use-animated-counter hook out of shared into state
- move certificate-verification into services/certificates capability
- Update
- Bump github/codeql-action from 3 to 4
- Bump gitleaks/gitleaks-action from 2 to 3
- Update
- Potential fix for code scanning alert no. 19: Missing origin verification in `postMessage` handler
- Potential fix for code scanning alert no. 13: Insecure temporary file
- Potential fix for code scanning alert no. 18: Useless conditional
- Potential fix for code scanning alert no. 16: Missing origin verification in `postMessage` handler
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Potential fix for code scanning alert no. 12: Incomplete multi-character sanitization
- Update
- Potential fix for code scanning alert no. 11: Incomplete multi-character sanitization
- Update
- Update
- Update
- Update
- Bump eslint from 10.7.0 to 10.8.0
- Bump @radix-ui/react-select from 2.2.6 to 2.3.7
- Bump @radix-ui/react-dropdown-menu from 2.1.20 to 2.1.24
- Bump react-hook-form from 7.81.0 to 7.83.0
- Bump @radix-ui/react-alert-dialog from 1.1.15 to 1.1.23
- Bump @radix-ui/react-toggle-group from 1.1.15 to 1.1.19
- Bump @testing-library/jest-dom from 6.9.1 to 7.0.0
- Bump lucide-react from 1.24.0 to 1.27.0
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Bump @radix-ui/react-scroll-area from 1.2.14 to 1.2.18
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Bump @supabase/supabase-js from 2.110.7 to 2.110.8
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Bump @types/node from 20.19.43 to 26.1.1
- Bump @radix-ui/react-popover from 1.1.15 to 1.1.20
- Bump typescript-eslint from 8.64.0 to 8.65.0
- Bump @radix-ui/react-radio-group from 1.3.8 to 1.4.4
- Bump @radix-ui/react-accordion from 1.2.12 to 1.2.17
- Bump @radix-ui/react-switch from 1.3.3 to 1.3.4
- Bump @radix-ui/react-menubar from 1.1.20 to 1.1.21
- Bump @radix-ui/react-aspect-ratio from 1.1.8 to 1.1.12
- Update
- Update
- Update
- Update
- Update
- Potential fix for code scanning alert no. 5: Creating biased random numbers from a cryptographically secure source
- Potential fix for code scanning alert no. 6: Creating biased random numbers from a cryptographically secure source
- Potential fix for code scanning alert no. 8: Insecure randomness
- Update
- Bump @radix-ui/react-collapsible from 1.1.15 to 1.1.17
- Bump @radix-ui/react-tooltip from 1.2.8 to 1.2.13
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Bump eslint from 9.39.5 to 10.7.0
- Update
- Bump @radix-ui/react-checkbox from 1.3.3 to 1.3.7
- Bump @sentry/nextjs from 10.65.0 to 10.66.0
- Bump @radix-ui/react-switch from 1.2.6 to 1.3.3
- Bump @radix-ui/react-scroll-area from 1.2.10 to 1.2.14
- Bump @radix-ui/react-label from 2.1.8 to 2.1.11
- Bump sharp from 0.34.5 to 0.35.3
- Bump @radix-ui/react-slider from 1.3.6 to 1.4.3
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Update
- Remove git clone instructions from README (private repo)
- Fix 6 react-hooks lint errors (set-state-in-effect, purity)
- Fix lint:fix script with cross-env too
- Add cross-env for cross-platform env var in lint script
- Set ESLINT_USE_FLAT_CONFIG=false for eslintrc compat in lint script
- Fix types for recharts 3.x (TooltipContentProps, DefaultLegendContentProps, DataKey as key)
- Downgrade eslint from 10.x to ^9.39.5 (compatible with eslint-plugin-react 7.x)
- Revert typescript from 7.x to ~6.0.0 (compatible with @typescript-eslint <6.1.0)
- Bump recharts from 2.15.4 to 3.9.2
- Bump eslint from 8.57.1 to 10.7.0
- Bump @radix-ui/react-slot from 1.2.4 to 1.3.0
- Bump typescript from 5.9.3 to 7.0.2
- Bump eslint-plugin-react-hooks from 4.6.2 to 7.1.1
- Bump lucide-react from 0.562.0 to 1.24.0
- Bump @types/node from 20.19.26 to 26.1.1
- Bump react-icons from 4.12.0 to 5.7.0
- Bump @radix-ui/react-separator from 1.1.8 to 1.1.11
- Bump @radix-ui/react-dropdown-menu from 2.1.16 to 2.1.20
- Bump actions/checkout from 4 to 7
- Update
- Update
- Update
- Update
- Update
- Update!
- Update!
- Update!
- Update!
- Update!
- Update!
- Update!
- Update!
- Update!
- Migrate from React to Next.js
- Updated the Portfolio component to use WebP images with PNG fallback
- Update!
- Update!
- Update
- Update sitemap.xml
- Update sitemap.xml
- Update content
- Update esbuild version to ^0.28.0
- Add esbuild as a devDependency to package.json
- Fix vite.config.ts
- Remove PWA
- Update content
- Create SECURITY.md
- Create README.md
- Install Vercel Web Analytics
- Update!
- Update!

### Added

- add fully automated release versioning pipeline
- cache public blog pages at CDN edge for 60s
- add weekly/monthly targets and custom reminder time
- redesign toasts to match Roya Raqamia design system
- add undo action to expense delete toast
- add CSV export and import with auto category creation
- add insights strip with top category, daily average, and period-over-period change
- add scheduled posts calendar view with drag-to-reschedule
- add bulk actions for posts (publish/unpublish/delete/setCategory)
- enable package import optimization for icon bundles
- add analytics date-range + CSV export and bulk link actions
- add device/OS/browser analytics breakdown
- add link expiry with active/expired/blocked status
- add many-to-many tags for posts
- thread per-user currency through dashboard and UI
- add in-editor SEO and stats side panel
- add content-stats util and live toolbar counters
- persist and validate per-user currency
- debounce auto-save and surface live saving state
- add user_settings migration for per-user currency
- add shared currency map and formatting util
- add insights strip with best day/hour, recovery rate and streak celebration
- add guided first-habit onboarding with template gallery
- add per-log notes/journal for habits
- add skip/miss streak-freeze for habit logs
- add recurring expenses with monthly materialization
- add per-category monthly budgets
- enable searching transactions by description
- use DatePicker in certificate form dates
- use DatePicker in expense dialog
- use DateRangePicker in transaction filters
- add Arabic RTL Calendar and DatePicker primitives
- add QR code modal to dashboard link rows
- add pure helper for short link URL used by QR codes
- scheduled daily habit_reminder notifications via pg_cron
- admin system_announcement broadcast
- monthly budget with expense_alert notifications
- notify recipient when a certificate is issued
- notify admins when a post is published
- notify link owner on click with cooldown
- add service-role notification service for production
- wire password reset through Resend instead of Supabase built-in email
- distraction-free mode, slash commands menu, and code language selector
- dashboard category filter, scheduled tab, views, and pinning
- scheduled status, category service/repo, and view counting
- add categories, scheduled publishing, and view counts schema
- add shared EmptyState component and migrate product empty states
- unified AppShell with product switcher and command palette
- add otp_codes migration and lock down RLS

### Fixed

- ensure tags are fetched before release version computation
- allowlist client-public NEXT*PUBLIC*\* values in gitleaks
- bump nanoid to 3.3.18 to clear high-severity advisory
- align links_expiry migration filename with remote version
- detect chunked supabase session cookies
- hide bell for unauthenticated visitors
- drop invalid optimizePackageImports for next 16
- serve webp via LazyImage with png error fallback
- dedupe @radix-ui/react-dismissable-layer so popovers/selects stay clickable inside modal dialogs
- layer select dropdown above modal z-index so in-dialog category picker opens
- layer popover above modal z-index so in-dialog date picker opens
- align migration filenames with remote schema_migrations versions
- stop leaking internal error messages on logout failure
- stop double-decrementing unread count on self mark-as-read
- fail closed on rate-limiter errors for auth and notifications
- only confirm the session account if its email matches the OTP target
- make pending-login store stateless across serverless instances
- paginate getUserByEmail beyond first 100 users
- clear poll timer on unmount to avoid leak
- resolve npm audit vulnerabilities (postcss + undici)
- align local migration filenames with remote Supabase versions
- resolve 19 TypeScript errors across linksnap and spendtrack
- implement missing parseAdminEmails function
- add challenges.cloudflare.com to CSP for Turnstile captcha
- harden safe-redirect against double-encoded payloads
- redirect to login on session expiry and show 'session expired' message
- remove React cache() from getAuthUser — it only works in RSC renders
- replace listUsers with targeted getUserByEmail and surface signIn errors
- replace plaintext password cookie with server-side token store
- rate-limit OTP verification and require pending record for resend
- keep users on update-password page after password reset
- stabilize OTP repository timestamp assertion

### Changed

- Add release version system: `scripts/compute-version.mjs` bakes `releaseVersion`
  (`X.Y.Z+build.N.<sha>`) into the bundle, exposed via `GET /api/version`.
- Add fully automated release workflow that bumps the version from conventional
  commits (`!` → major, `feat` → minor, else → patch), tags, and writes `CHANGELOG.md`.
- Tag Sentry releases with the app version.

### Added

- `scripts/release-tools.mjs` — shared release logic (tag parsing, bump rules, changelog).
- `package.json#version` — now the workflow-maintained source of truth for the core `X.Y.Z`.
- `npm run version:next` — local dry-run helper that rehearses the next release.
- `backend/config/generated/app-version.ts` — generated module carrying release metadata.

### Security

- Non-functional change for release tooling; no access-control or RLS changes.
