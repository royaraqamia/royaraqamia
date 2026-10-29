# Plans count items and actions; there is no credit pool

ADR-0075 gave a plan two allowances and made one of them a rolling credit
ledger: 100 credits per 30 days on Free, 10,000 on Pro, with each metered action
carrying a cost. That made the allowance a shared balance — ten posts _or_ twenty
downloads _or_ a hundred links — and it reset every 30 days.

This record keeps the standing cap, replaces the ledger with a count, and states
the numbers the product actually sells: **5 of everything on Free, 50 on Pro, 1
download and 1 of each daily action for a visitor.** The Free allowance never
grows back on its own; a download is never given back, and a daily action returns
at Damascus midnight.

## The decision

Two mechanisms remain, and neither is a balance:

| mechanism          | answers                                         | lives in                         | resets         |
| ------------------ | ----------------------------------------------- | -------------------------------- | -------------- |
| **owned-item cap** | "how many habits/links/bookmarks may I hold?"   | `plan_limits`, checked at create | never          |
| **counted action** | "how many times may I download/open/scan/read?" | `usage_limits` + `usage_events`  | never or daily |

An owned item frees its slot when it is deleted: the row is the count. A counted
action leaves no row to count — a download job is swept, a digest is read, a scan
never leaves the device — so the count is an event, and deleting whatever the
action produced does not refund it. That asymmetry is the point: "5 downloads" is
a lifetime budget, not a shelf.

### The numbers

| owned item                                       | free | pro |
| ------------------------------------------------ | ---- | --- |
| notes, habits, expenses, categories, budgets     | 5    | 50  |
| short links, drafts, published, tags, categories | 5    | 50  |
| Quran bookmarks                                  | 5    | 50  |
| connected MCP apps                               | 1    | 10  |

| counted action  | window   | visitor | free | pro |
| --------------- | -------- | ------- | ---- | --- |
| a download      | lifetime | 1       | 5    | 50  |
| a digest opened | daily    | 1       | 5    | 50  |
| a scan          | daily    | 1       | 5    | 50  |
| a surah read    | daily    | 1       | 5    | 50  |

Community publish consumes a published slot; editing, duplicating and uploading
an image are free. MCP write calls, consultations, training applications,
project requests and the retainer are unmetered.

### A day is a Damascus day

Every daily count flips at `date_trunc('day', now() at time zone 'Asia/Damascus')`,
which is the day the news digest itself uses (`digest_date`). The device computes
the same day with `Intl.DateTimeFormat(..., { timeZone: 'Asia/Damascus' })`, so a
scan counted offline and a digest opened online agree about when "today" ended.

### A digest is counted when it is opened

Generation is not metered: the nightly workflow writes a reader's personal digest
whether or not they will open it, and charging that would bill for output nobody
saw. The board route counts the digest _day_ it answered, deduplicated by that
date, so a refresh or a Realtime update is free and moving through the archive
costs one per day opened. A search over the archive is not an open.

### The visitor subject is a cookie plus the salted address

A lifetime allowance cannot rest on a cookie alone: clearing storage would reset
it. Both are recorded — `visitor_key` (an opaque first-party id minted by the
edge middleware) and `ip_hash` (`HMAC-SHA256(salt, ip)`, never the address) — and
the count matches either, so the two identify one allowance. The cost is stated
plainly: one shared address is one visitor allowance.

### The count is atomic

`record_usage` takes an advisory lock keyed on the subject, counts the window,
and inserts in one transaction, so two concurrent requests cannot both take the
last slot — the property the credit pool had. A refusal writes nothing; a caller
whose work then fails deletes the event it wrote (`release_usage`). Admins are
unlimited and write no event.

## Consequences

- The catalog is data: `plan_limits` and `usage_limits` are public reads, seeded
  by the migration, and the pricing page, the account card, the Admin Console and
  the enforcement all read the same rows. The pricing page keeps one display-only
  fallback copy for a database outage (ADR-0075's rule, unchanged).
- The pricing page states two tiers plus a footnote for visitors, because a
  visitor is not a plan. It no longer says "N credits"; it says how many items
  and how many actions, which is what the database refuses on.
- `plan_settings` keeps price, currency and duration. The credit columns, the
  rolling window and `user_plans.window_reset_at` are dropped, as is
  `usage_action_costs`.
- The ledger starts empty. A cap is enforced at create and never over existing
  rows, so an account above a new cap keeps every row and simply cannot add more
  — ADR-0075's grandfathering rule, and the reason a Pro account with 300 habits
  becomes read-only above 50 rather than losing 250 rows.
- The local counters (scan, surah read) refuse on the device once the cached cap
  is reached, so the Outbox never carries an intent the server is certain to
  reject. A cold signed-in device is let through; the server is the authority.

## Limits

- **A lifetime count is unforgiving.** Five downloads for the life of the
  account, with no path to a sixth except a plan change. That is the decision,
  not an oversight.
- **A visitor allowance is friction, not identity.** A new address, or a browser
  that drops both the cookie and the address, starts again.
- **The news cap is a reading limit on the archive.** It is enforced at the route
  that serves the board; a client that never asks for the board (an offline
  snapshot) does not consume, and cannot be counted.
- **The offline overrun is still real.** Two devices offline at once can each
  count the day's remaining actions before either reports.
