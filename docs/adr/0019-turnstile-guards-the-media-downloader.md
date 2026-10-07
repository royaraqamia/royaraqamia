# Turnstile guards the anonymous Media Downloader

Every other public anonymous route in the repo — LinkSnap's shorten and unlock, Consultation
bookings — relies on per-IP Upstash rate limits alone, and Turnstile is wired only into auth
(`backend/config/auth.ts:51`). The **Media Downloader** is different in kind: each request
makes an external host spend real CPU, bandwidth and money, so it is a much stronger abuse and
cost magnet. We decided to require Turnstile on every `POST /api/downloader/jobs` from an
anonymous visitor, fail-closed, in addition to the IP limit and the size/duration caps.

## Considered options

- **IP rate limits only, like the other public routes.** Rejected: cheap for an attacker to
  rotate around, and the per-request cost here is far higher.
- **Put the tool behind sign-in.** Rejected: contradicts the free anonymous top-of-funnel
  intent, and an account is no proof of good behaviour.

## Consequences

The tool page must ship the Turnstile widget, and the create route fails closed when the
secret is configured. This is a deliberate departure from the repo's other public routes; a
future reader should not "simplify" it away by matching LinkSnap.
