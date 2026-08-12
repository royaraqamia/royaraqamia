# Security Policy

| Attribute            | Value                                  |
| -------------------- | -------------------------------------- |
| **Document version** | 1.0.0                                  |
| **Status**           | Production                             |
| **Last reviewed**    | 2026-08-02                             |
| **Next review due**  | 2027-02-02 (mandatory 6-month cadence) |
| **Owner**            | م. أيْهَم العَلي (project owner)       |
| **Approved by**      | Project owner                          |

This document defines the security posture of the **royaraqamia** application — a Next.js (App Router) platform backed by Supabase, Sentry, Resend, Upstash Redis, and Cloudflare Turnstile, deployed on Vercel.

It is a **private, confidential codebase**. All code, configuration, data, and documentation contained in this repository are confidential and proprietary. Treat every rule below as **mandatory**; exceptions require explicit sign-off from the project owner and a recorded risk acceptance.

---

## Security Policy & Version Support

This application is deployed as a single production release. Security patches are backported to the current production release and shipped within the patch-policy window below.

### Patch Policy

- **Critical / High severity:** fix released within **72 hours** of confirmation.
- **Medium severity:** fix released within the next scheduled release (max 30 days).
- **Low severity / hardening:** fixed in the next minor release.
- When a patch is backported, the `CHANGELOG` and release notes MUST identify the security fix.
- Security fixes are released **with a private, pre-announced advisory** when the fix touches a live exploit path.

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security bugs.** Issues are public and would expose the vulnerability before a fix exists (responsible disclosure).

### How to report

1. Send a detailed report to: **contact@royaraqamia.com**
2. Subject line MUST be prefixed with `[SECURITY]` — e.g. `[SECURITY] Stored XSS in article editor`.
3. A machine-readable disclosure file is published at `/.well-known/security.txt` (RFC 9116); it MUST stay in sync with this policy.
4. **PGP encryption is required for sensitive reports.** Encrypt with our key:
   - **PGP Fingerprint:** `672D A1FC CB71 7ECA 20C2  1531 C402 2CE9 1654 5CE1`
   - Key is also published at the contact address's keyserver entry.

5. Include, where possible:
   - Affected endpoint/component and file reference.
   - Steps to reproduce (exact request payloads, curl commands, screenshots).
   - Impact assessment and a suggested fix, if known.
   - Environment: Node version, browser/OS, deployed commit hash.
6. For sensitive data (e.g. real user records), **do not** include it in the report body; describe the exposure instead.

### What happens next

| Step                                   | Timeframe                   |
| -------------------------------------- | --------------------------- |
| Acknowledgement of receipt             | Within **48 hours**         |
| Triage & severity assessment           | Within **5 business days**  |
| Fix developed & verified               | Per severity table above    |
| Fix deployed to production             | After verification          |
| Coordinated public disclosure (if any) | With the reporter's consent |

Severity is classified per **CVSS v4**; the decision is recorded in the tracking ticket.

### Out of scope

- Reports on third-party dependencies already covered by their own disclosure programs.
- Self-XSS, clickjacking without demonstrated impact, or phishing of the operator.
- Missing security headers with no demonstrable exploit.
- Denial-of-service via already rate-limited endpoints.
- Suspected leaked credentials from a third-party breach (report through the affected vendor).

### Hall of Fame

Responsible reporters may, with their consent, be publicly acknowledged after the fix is shipped.

---

## Threat Model

Senior review requires an explicit threat model. Trust boundaries, assets, and actors are documented so new features are reviewed against them.

### Assets

- **Code & configuration** — the repository, environment variables, deployed builds.
- **User data** — PII submitted via forms, contact inquiries, training enrollment data.
- **Media** — user-uploaded files stored in Supabase Storage.
- **Credentials** — Supabase (service role, publishable keys), Resend, Upstash, Sentry auth token, Turnstile secret.
- **Service continuity** — Vercel deployments, database, email and analytics pipelines.

### Trust boundaries

1. **Public anonymous → application:** forms, content rendering, public API routes.
2. **Browser → Supabase:** client requests scoped by the publishable key and Row Level Security (RLS).
3. **Server → Supabase / Upstash / Resend / Sentry:** privileged channels using the service role key and server secrets — **never reachable from the browser**.
4. **Admin/editor → application:** authenticated, privileged surface requiring MFA and strict session controls.

### Threat actors & assumed mitigations

| Actor                         | Primary goal                             | Primary defense                                      |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Anonymous attacker            | Abuse forms, probe auth, inject payloads | Zod validation, Turnstile, rate limiting, CSP, RLS   |
| Compromised dependency        | Supply-chain tampering                   | Lockfile, `npm audit` gate, Dependabot, SBOM         |
| Compromised admin account     | Data exfiltration                        | MFA, session timeout, audit logging, least privilege |
| Insider / negligent developer | Secret leakage                           | Secrets protocol, pre-commit checks, CI scanning     |
| Automated scanners/bots       | DoS, scraping, brute force               | Rate limiting, Turnstile, WAF-style headers          |

New features MUST identify which assets they touch, which boundaries they cross, and which mitigations apply **before** merging.

---

## Data Protection & Compliance

We process user data in compliance with modern data-protection regulations, including the **GDPR (EU)** and **CCPA/CPRA (California)** where applicable.

### Legal basis & processing

- Processing is limited to a documented **legal basis** (consent, contract, legitimate interest) per processing activity.
- **Data Protection Agreements (DPAs)** are in place with every processor: Supabase, Vercel, Resend, Upstash, Sentry, and Cloudflare. Store the signed DPAs with the project records.
- **Data residency:** production data is hosted in the region configured at project creation; do not change regions or replicate data across borders without a compliance review.
- **Children's data:** the service does not knowingly collect data from minors; if discovered, delete it and apply parental-consent review.

### Encryption in Transit

- All traffic MUST be served over **HTTPS/TLS 1.2+** (TLS 1.3 preferred). HTTP traffic is redirected to HTTPS.
- HSTS is enforced; API and database connections use TLS exclusively.
- All outbound integrations (Supabase, Resend, Upstash Redis, Sentry, Vercel, Turnstile) communicate over encrypted channels only.

### Encryption at Rest

- **Databases:** encrypted at rest (Supabase/Postgres storage encryption).
- **Backups:** encrypted at rest and during transfer; keys are separated from the data.
- **Secrets:** stored only in the platform secret managers (Vercel, Supabase) — never in source code.
- **Media/user files:** stored in private storage buckets; only publicly referenced objects are made readable.

### User Data Handling

- **Data minimization:** only collect the data strictly required to operate the service.
- **Access control:** least-privilege principle. Service-role credentials are server-side only and never exposed to the client.
- **Right to erasure:** users may request deletion of their data; deletion is propagated to all stores and backups per retention policy.
- **Right to access:** users may request an export of their personal data in a portable format.
- **Retention:** personal data is retained no longer than necessary and purged per the retention schedule.
- **Breach notification:** report a suspected personal-data breach immediately to the project owner and, where required, to the relevant supervisory authority within **72 hours** of awareness (GDPR Art. 33).

---

## Secrets Management Protocol

**No API keys, database credentials, secret tokens, or private keys are EVER allowed to be committed to Git.**

### Hard rules

1. Secrets live ONLY in the local `.env` file and in the platform secret managers (Vercel Environment Variables / Supabase Secrets).
2. The `.env` file is **ignored** by Git (see `.gitignore`: `.env*` with the exception of `.env.example`). Never force-add it.
3. Never commit: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SECRET_KEY`, or any credential in the example above.
4. Never paste a secret into a GitHub issue, chat, screenshot, or log output. Redact first.
5. Rotate any secret immediately if it is suspected to be compromised, then revoke the old value.
6. One key per environment (dev/staging/production) — **never share** secrets across environments.

### `.env` usage

- Copy `example.env` to `.env` locally: `cp example.env .env`
- Only **public** values (those with the `NEXT_PUBLIC_` prefix, e.g. site URL, publishable keys) may be exposed to the browser. Everything else stays server-only.
- A committed file may contain **placeholder values only** (see `example.env`). Real secrets never enter the repository.
- Treat `.env` files as ephemeral: regenerate production values at least every 90 days and on every suspected leak.

### Pre-commit & CI checks

- Before `git add` and `git commit`, review the staged diff (`git diff --cached`) to confirm no secret or `*.pem`/key file is staged.
- **Enforced in CI:** a secrets scan (e.g. gitleaks/TruffleHog or GitHub secret scanning) runs on every PR and blocks merges on detection.
- If a secret is found in history, treat it as compromised, rotate it, and remove it from history (e.g. `git filter-repo`), then force-push and invalidate all caches/forks.

---

## Code Sanitization Standards

All code merged into this repository MUST satisfy the following standards.

### Input Validation

- Validate **all** input — from query params, route params, headers, cookies, request bodies, and external services.
- Prefer schema validation with **Zod** (already in the dependency tree) at the API boundary; reject unknown fields and invalid types.
- Enforce length, range, format, and whitelist constraints. Use `z.enum`/`z.literal` for enumerations; never trust raw values.
- Validate file uploads by MIME type, extension, and size; store files with random names and serve them from restricted paths.
- Server-side validation is mandatory — client-side validation alone is never sufficient.

### SQL Injection Prevention

- Never build SQL by string concatenation or template interpolation with user input.
- Use **parameterized queries / prepared statements exclusively** (Supabase JS client uses parameter binding; ORM/query-builder APIs are preferred over raw SQL).
- If raw SQL is unavoidable, it must use bound parameters only, and pass code review.
- All database access goes through the Supabase client with the **service role key kept strictly server-side**; client requests are scoped by RLS and the publishable key.
- Adhere to Postgres best practices: least-privilege roles, and **Row Level Security (RLS) enabled on all user-facing tables**; RLS is verified in CI (e.g. a policy test that asserts RLS is on for every public table).

### XSS Mitigation

- Treat all user-generated content as untrusted.
- Render HTML with a sanitizer (e.g. a dedicated HTML sanitizer) before output; never inject raw HTML from user input into the DOM.
- Escape by default in JSX/React; avoid `dangerouslySetInnerHTML` unless content is sanitized — and never with unsanitized user input.
- Use the framework's built-in protection: React auto-escapes interpolated values — do not defeat it.
- In rich-text flows (TipTap/markdown), sanitize output before rendering and strip event handlers, `javascript:` URIs, and `<script>`/`<iframe>` tags.
- Set a strict **Content Security Policy (CSP)** enforced in `next.config.js`/middleware. Disable inline event handlers; restrict `script-src`, `frame-ancestors`, and `connect-src` (allowlist only Supabase, Sentry, Upstash, Vercel, Turnstile origins).

### Cross-Origin Resource Sharing (CORS)

- CORS headers are applied **explicitly and narrowly** — never `Access-Control-Allow-Origin: *` with credentials.
- Only the production domain(s) (and staging equivalents) are allowlisted; reflect `Origin` only if it matches an allowlist.
- `Access-Control-Allow-Credentials` is set `true` ONLY when the request comes from an allowed origin AND cookies are required; otherwise omit it.
- Server-side routes and Supabase clients are configured with the narrowest allowed origin list.
- CORS rules are declared in one central place (`next.config.js`/middleware) and asserted in CI (a test that fails on a wildcard or unknown origin).
- Validate any new external origin added to the allowlist with a security review before merging.

### Authentication & Authorization

- Use the platform auth (Supabase) with secure, `HttpOnly` session cookies, SameSite policy, CSRF protection, and email verification; never roll your own session logic.
- **Admin/editor accounts require MFA** (e.g. TOTP) and a short session idle timeout.
- Enforce RBAC at the data layer (RLS policies), not only in the UI.
- Rate limit auth endpoints (Upstash Ratelimit) and gate public forms with Cloudflare Turnstile.

### Logging & Monitoring

- Log access and errors (Sentry) but never log secrets, tokens, passwords, or full user data; redact PII in logs.
- Enable Sentry alerts for `5xx` spikes and authenticated failures; review alerts on a weekly cadence.
- Correlate rate-limit and Turnstile rejections to detect brute-force/bot activity.

---

## Secure Development Lifecycle (SDLC) & CI/CD Gates

Security is enforced at every stage. The following gates are **required** in CI and block merge if any fails:

| Gate                   | Tool / Practice                                                         | Blocking            |
| ---------------------- | ----------------------------------------------------------------------- | ------------------- |
| Lint & type check      | ESLint + `tsc --noEmit` (already in `package.json`)                     | Yes                 |
| Static analysis (SAST) | ESLint security rules (e.g. `eslint-plugin-security`) and GitHub CodeQL | Yes                 |
| Secrets scan           | gitleaks / TruffleHog / GitHub secret scanning                          | Yes                 |
| Dependency audit       | `npm audit` + Dependabot alerts                                         | Yes (high/critical) |
| RLS policy check       | Test asserting RLS is enabled on public tables                          | Yes                 |
| CORS/CSP check         | Test asserting allowed origins & CSP directives                         | Yes                 |
| Tests                  | Vitest unit + Playwright e2e                                            | Yes                 |
| Build                  | `next build`                                                            | Yes                 |

- `npm audit` is run on every release; high/critical findings are triaged to zero before deploy.
- PRs touching auth, payments, data handling, or storage require a **security-aware reviewer** in addition to a functional reviewer.
- Every production deployment is traceable to a commit hash (Vercel deploys) for incident correlation.

### Known limitation: TypeScript 7 native preview

The project intentionally pins **TypeScript 7 (native/Go preview)**. Next.js's _built-in_ type checker requires the classic JS compiler API (`lib/typescript.js`), which TypeScript 7 native does not ship — therefore `typescript.ignoreBuildErrors: true` is set in `next.config.js`.

This is **not** a type-check bypass: the authoritative type gate is **`tsc --noEmit`** (strict mode), which runs **first** in `npm run build` (`tsc --noEmit && next build`) and as its own step in CI. The flag only disables Next's redundant duplicate check. If `tsc --noEmit` ever fails, the build fails. Revisit this exemption when Next.js adds first-class TypeScript 7 support and remove `ignoreBuildErrors` then.

---

## Supply Chain Security

- Commit the **lockfile** (`package-lock.json`) and never edit `node_modules` by hand; installs must be reproducible.
- Enable **Dependabot** for dependency, GitHub Actions, and npm vulnerability updates.
- Keep `package.json` `overrides` (e.g. `postcss`, `sharp`) reviewed — override pins are a supply-chain control and MUST have a commented justification.
- Prefer official packages and pinned ranges; review any newly added dependency for maintenance status and download health.
- **SBOM:** generate a software bill of materials at release (e.g. `npm sbom` or GitHub dependency graph export) and store it with the release.
- **Commit signing:** all commits MUST be signed (GPG/SSH). Unsigned commits are rejected in CI where supported.
- Treat `npm install` output as untrusted: never execute scripts from unpublished or renamed packages.

---

## Admin & Privileged Access Security

- **MFA is mandatory** for all admin/editor and project-owner accounts (Supabase, Vercel, GitHub, Sentry, Upstash, Resend).
- Enforce least privilege: admin roles get only the permissions required; service-role keys are only used in server code, never in middleware or client bundles.
- **Break-glass account:** a documented, MFA-protected emergency account exists with credentials sealed offline and available only to the project owner; its use is logged and reviewed.
- Privileged sessions have a short idle timeout and are invalidated on password/secret rotation.
- Audit log: track admin sign-ins, role changes, and destructive operations (deletes, exports) for at least 180 days.

---

## Incident Response Plan

1. **Detect & declare:** any confirmed or strongly suspected compromise (account takeover, breach, exploit in the wild, leaked secret) triggers an incident. Assign one Incident Commander (project owner by default).
2. **Contain:** revoke the affected secret(s), disable the affected accounts, and block the affected origin/IP at the edge within 60 minutes.
3. **Eradicate & recover:** patch the root cause, redeploy from a clean commit, and restore data from the last clean backup.
4. **Notify:** inform affected users where legally/ethically required, and the supervisory authority within 72 hours if personal data was involved.
5. **Postmortem (within 7 days):** document timeline, root cause, blast radius, and preventive measures; the postmortem MUST propose concrete hardening items that are tracked to completion.

**Contact tree:** reporter → `contact@royaraqamia.com` → project owner → relevant vendor (Vercel/Supabase/etc.). Keep the vendor security pages (Vercel, Supabase) bookmarked for abuse/compromise reporting.

---

## Backup & Disaster Recovery

- **Database:** automated daily backups retained ≥ 30 days; verify a restore at least quarterly.
- **Storage:** media files backed up or re-derivable; objects follow the same retention schedule as their parent data.
- **Code:** GitHub is the source of truth; force-push history rewrites are forbidden outside secret-removal incidents.
- **DR target:** restore service to production state within **24 hours** of a total data-center failure using a clean checkout, environment secrets from the secret manager, and the latest verified backup.

---

## Security Verification & Continuous Monitoring

- **Header audit:** run the production domain through `https://securityheaders.com` after each release; grade must be **A or better** for `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and HSTS.
- **TLS check:** verify TLS 1.2+/1.3 and certificate health (e.g. `SSL Labs`) on every certificate renewal and before major releases.
- **Dependency sweep:** `npm audit` at least weekly via Dependabot; triage high/critical to zero before any release.
- **Secret re-scan:** run the history scan (`git log --all`) quarterly and after any suspected leak.
- **Access review:** quarterly review of who has admin access across GitHub, Vercel, Supabase, Sentry, Upstash, and Resend; remove inactive accounts.
- **This policy** is reviewed and versioned at least **every 6 months**; changes are tracked in Git history.

---

## Server-Side Request Handling (SSRF) & Middleware Hardening

### SSRF prevention

- The server MUST **never** fetch a user-supplied URL (images, embeds, previews, webhooks) without validation.
- If server-side fetching is required: validate the URL against a **scheme allowlist** (`http`/`https` only), reject URLs with credentials or non-standard ports, resolve the hostname and **block private, loopback, link-local, and cloud-metadata IP ranges** (169.254.169.254, 10/8, 172.16/12, 192.168/16, ::1, etc.), and cap/disable redirects.
- Prefer serving media from **Supabase Storage via signed URLs** rather than proxying arbitrary external URLs.
- Validate the **Host header** on every request to prevent host-header injection and DNS rebinding; only the canonical domain(s) are accepted.

### Middleware hardening

- `middleware.ts` runs at the **edge** — it MUST NOT import, read, or use server-only secrets (service-role keys, API tokens). Such secrets are only safe in server-side route handlers / server components.
- Keep middleware lean: perform session refresh and lightweight routing only; never run heavy computation, DB queries, or secret handling there.
- Ensure sensitive routes (admin, auth callbacks, API endpoints) are matched in the middleware `matcher` so stale sessions are rejected before reaching handlers.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` for admin), with a bounded lifetime and refresh flow (see `@supabase/ssr`).

---

## Contact

For security questions or to report a vulnerability, contact **contact@royaraqamia.com** with the subject prefix `[SECURITY]`. All code, configurations, and documentation in this repository are confidential and proprietary.

## PGP Public Key

Fingerprint: 672D A1FC CB71 7ECA 20C2 1531 C402 2CE9 1654 5CE1

```pgp
-----BEGIN PGP PUBLIC KEY BLOCK-----

mQINBGpvOn4BEACdJam0/aZAGGLsaMAPNoFSCxrARl79s0J+WkjCrZqaBQ/0ZUvG
3sznVjlgVFszl2JHmqWNHiIol2VKc7WHxy8lHyHiD9pO5Tx4vyH88uaVsAYEbicS
nCuZyRdIFHgpMQYfb+5k7xbZ5u5NkC4XhWGgN+mvP2+i+kgjRkILXAQ2JNh6FujB
Wgbl6juJ08jBTEnLeitUV+pGaA9KC70qTqwuqhOhFlnVxaToshkfl1QzcG5aMtcq
NM1zPCbmtYreiTLkdA5mwFAKvB2G/ZyhO4TCuDUcPRXnPjioicatC3BFhltKsI+A
c7FDLIiM3/Cq7k7Jk7wdAyc2rxLqFQuy6Ixol/m6IGsckFEDHbs5QENM31947PKk
df8eXsexgZLlKkdaz8QqbVvPaxZJLQNnE9nfOUm23+uIVx5cVMkxWLZH02WFabK7
LAgR+920MZY4O2w+/mhM0LdMk+mz6xckT5/sulr0dnKAK2iQfcQt4MI+XEnBxz+O
ZIkcNLB+ofj2oEw/XFDd9Sa8BKIDbWpNPcPejOm9npYvh01o3BUKTpVHYeTnpPNj
EPdHITPfAnR/EippdvtjiKgIzxxXPEBLqSHxT+cplybzwxh1IISZ9PSd8DYtVY/H
Opx7Ou0PMesOiJbKMHUQll9z2KPL/QvJwwXggZLbyExELdTGtyfuSZmgcQARAQAB
tCZSb3lhIFJhcWFtaWEgPGNvbnRhY3RAcm95YXJhcWFtaWEuY29tPokCbgQTAQgA
WBYhBGctofzLcX7KIMIVMcQCLOkWVFzhBQJqbzp+GxSAAAAAAAQADm1hbnUyLDIu
NSsxLjEyLDIsMQMbLwQFCwkIBwICIgIGFQoJCAsCBBYCAwECHgcCF4AACgkQxAIs
6RZUXOFPvw/+NLwxKsycKKYc81AJZc4KKuwuzfSytJA5AMU2PkqWBsPyc0Rh0lQB
4iINEiZl+++rszyKIeLhh11b/h0EvtI6PIfl3RCxQJ966l4ubS4cBzXbiwnXdlFp
PgX37xa0wGRrAYQbd/J29YddBNiXOx0l6Lu7Uure9woMHjubiDD8NtiXC0y5JvYg
Sc6a6gh1OtaxF5YqLmvO5eSLAf5fwjm38qmAdFMCgKmm2Hs4WE9oMmcRMxU/JPd/
rLVW8PgpNonr/VDjev4qg0S7u6zHxRnFbFmF+oGB1osp1K5HaeCG1qQSAB9wks1+
8fNp7wvf+RS8ALqR7m6cbNHYxIHvHKYSVb8mYgYuXX/JXuO/PxYdAowavSRPJ+m1
8lSVthGmKvAjT9gU4CTZcfIphU0EtwhoeI37Kw8sgvnozOdD4iooWmfioFBHAO2h
8cdkPnYjv/LsLYyAjjR4kQtydo9a7/4vV84CZ46GGOfdPz6hioFONnMaJs0SYwVJ
ycf1TdgSeX/VLe06W7M70WqxTNg0B4NC+knkSGdVRaruAchJbEr89ZF9n9w+009P
4Qd57EatKYpcM1PbE7R71wWZuvg2dDtznjGnLnPuTJn8oiojl9B63zJQBmAWZLke
s+j6za6MZZdupzL+2HZ3pNcyT7Qd558/5O93bIXqURv7lA2wqqXEd5w=
=drqN
-----END PGP PUBLIC KEY BLOCK-----
```
