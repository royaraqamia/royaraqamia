# Plans meter credits and cap ownership, never reads

Everything the site offers is reachable today, free and mostly anonymous: the
Community feed, short links, the Media Downloader, the Quran Reader, the
Scanner, Consultations, Training applications and the client-work forms. A paid
plan needs a boundary that is honest to a reader and enforceable on the server,
and the obvious one — "limit usage" — hides two different questions: how much a
user _does_ this month, and how much a user _keeps_.

## The decision

**The free plan is $0 with 100 credits per rolling 30 days and small
owned-item caps; the paid plan is $10 per 30 days with 10,000 credits and
generous caps.** Both plans reach every product; only the allowance differs.
Money moves off-system and an operator activates the plan by hand, so ADR-0006
still holds: nothing here charges anyone.

Two mechanisms, deliberately not merged:

| mechanism          | answers                                       | lives in                                     | resets   |
| ------------------ | --------------------------------------------- | -------------------------------------------- | -------- |
| **credit spend**   | "how much have I used this month?"            | `usage_events`, summed over a rolling window | ages out |
| **owned-item cap** | "how many habits/links/bookmarks may I hold?" | `plan_limits`, checked at create             | never    |

Merging them was considered and rejected: a pool resets, ownership does not, so
"having five habits" can only be priced in credits as **monthly rent** — saved
data would silently consume the allowance and deleting a post would become a way
to regain credits. The account card therefore shows **one** number (credits
remaining); caps surface only where they bind (`3 من 5 عادات`) and in the
pricing comparison table.

### Reads are not metered

No page load, feed page, exchange-rate view, certificate verification, Quran
surah or dashboard read costs a credit. Metering reads would make every page
per-user and uncached, which is a deliberate reversal of ADR-0073 (cached
product shells) and the cache budget in ADR-0069, and it would turn a traffic
utility into a paywall. Credits are spent by **actions**: publish, create,
download, scan, book, submit, or an MCP write tool.

### The plan sets the cap; there is no balance

`user_plans` stores a plan and an expiry; an absent row means free. A spent
credit is a row in `usage_events`, and the remaining amount is **computed** from
the ledger, never stored. That removes a whole class of drift (a cached balance
that disagrees with its events) and makes the limit atomically enforceable:

- `spend_credits` takes an advisory lock for the user, sums the window, refuses
  when `spent + cost > cap`, and inserts — so two concurrent requests cannot
  both spend the last credit. The insert returns the event id, which is what a
  failed action refunds: the spend is a **reservation**, so `runMetered` gives
  the credit back when the write behind it throws (a refund that itself fails is
  logged, never surfaced over the action's own error).
- The same call computes the window floor: `now() - window_days`, then
  `window_reset_at` (an activation), then `expires_at` when a pro plan has
  lapsed. No cron job, no race between "it expired" and "it was reset".

**Activation and expiry both reset the window.** An upgrade starts from zero
(the approved rule), and a lapse starts from zero too, so a heavy subscriber is
never blocked for a month by usage their payment already covered. A renewal
extends from the current expiry rather than truncating it. Every grant writes a
`plan_activations` row in the same transaction — who activated, when, amount,
method, note, expiry — because the payment itself happened outside the database.

### Caps

| item                         | free   | pro         |
| ---------------------------- | ------ | ----------- |
| habits                       | 5      | 200         |
| expenses                     | 100    | 10,000      |
| expense categories           | 10     | 50          |
| budgets                      | 3      | 30          |
| short links                  | 10     | 1,000       |
| community drafts / published | 5 / 10 | 100 / 1,000 |
| community tags / categories  | 5 / 3  | 50 / 30     |
| Quran bookmarks              | 20     | 1,000       |
| connected MCP apps           | 1      | 10          |

Caps are `INSERT`-time checks, not deletions: a user already above the free cap
at migration time keeps every row and simply cannot add more. Nothing is trimmed
to fit a plan.

### Credits

| action                                                  | cost  |
| ------------------------------------------------------- | ----- |
| publish a Community post                                | 10    |
| edit / duplicate a post                                 | 1 / 5 |
| upload a post image                                     | 2     |
| create a short link                                     | 1     |
| create a Download Job                                   | 5     |
| MCP write-tool call                                     | 1     |
| consultation booking / training application             | 1     |
| project request / retainer request                      | 1     |
| scanner scan (local counter)                            | 1     |
| Quran surah opened, once a day (local counter)          | 1     |
| habits, expenses, budgets, categories, bookmarks writes | 0     |

### Visitors

A visitor has no ledger, so the subject is a **salted hash of the IP**, computed
in the app; the raw address is never stored. The allowance is 10 credits per
rolling 24 hours (`spend_anonymous_credits`). Exhausting it prompts sign-in,
which is the free plan and a larger allowance. The same hashed subject is all
the lead forms need, so "anonymous" does not become "unmetered": an application
or booking refusal is still a refusal with a clear message, never a silent drop.

The Scanner (ADR-0034) and the Quran Reader (ADR-0056) never talk to a server
while they work. Metering them without breaking offline means a **local
counter** in the same cache the app already owns, blocking locally at the cap
and syncing the count when a connection returns; the server reconciles rather
than enforcing in the moment. The consequence is stated plainly: an offline
device can overrun its counter by whatever it does before it next syncs, and
that is accepted in exchange for two products that keep working with no signal.

### Admins

An Admin is unlimited (the derived `users.is_admin` flag, ADR-0003). The credit
RPCs return `unlimited: true` for them, so operating the Admin Console can never
be blocked by a customer allowance.

## Consequences

- The catalog — price, duration, pools, caps and per-action costs — is data
  (`plan_settings`, `plan_limits`, `usage_action_costs`) seeded by the
  migration, not constants in code. The pricing page, the account card, the
  Admin Console and the spend RPC read the same rows, so a number changes once.
  The one deliberate copy is the pricing page's last-resort fallback: a database
  outage must not take the page that explains the plans down with it, and that
  copy is display-only — enforcement always reads the tables.
- The ledger tables grant nothing to `anon` or `authenticated`; every read and
  write goes through an authenticated route or a service-role RPC. The catalog
  tables are public reads because the pricing page renders them and the offline
  client needs the caps to refuse a queued write before it leaves the device.
- `spend_credits`, `get_usage_state`, `spend_anonymous_credits`, `activate_plan`
  and `list_user_usage` are `SECURITY DEFINER` and executable by `service_role`
  alone, so none of them is a PostgREST route.
- Unknown action keys raise `22023` instead of inserting a zero-cost event: a
  typo fails loudly at the call site rather than becoming free usage.
- The Admin Console gains `/admin/plans`: search, plan, expiry, spend, cap, and
  a deliberate one-click 30-day activation that records the amount and method.
- Enforcement lands in three pull requests (schema + Admin Console, then the
  pricing page and account card, then the per-product hooks). This document
  describes the whole arrangement; a deploy of the first one blocks nothing.

## Limits

- **The first release meters only what has a server entry point.** Scanner and
  Quran spend through their local counters; every other product is metered at
  the controller/service seam. A product with no server call cannot be metered
  at all, and the pricing page must not pretend otherwise.
- **The anonymous subject is not an identity.** A shared NAT, a VPN or a
  cleared cookie store changes the count; the allowance is abuse friction, not
  an account.
- **A rolling window has no reset date.** The card reports what is left now and
  the window length; it cannot say "resets on the 5th". That was chosen over a
  calendar month so a paid subscriber's window matches the 30 days they paid
  for.
- **An offline overrun is real.** Local counters reconcile after the fact; two
  devices offline at once can each spend the remaining allowance before either
  reports.
- **The pool caps are per plan, not per product.** 100 credits is 10 posts _or_
  20 downloads _or_ 100 links, not ten of everything; the pricing page says so
  in those words.

## Amendment (2026-10-22): the enforcement layer

The third pull request wires the rules into the products. What the first two
left open, decided here:

- **One door.** Every metered or capped write calls `createPlanGate()`
  (`backend/services/plans/plan-gate.ts`): `meter` reserves, runs and refunds on
  failure; `meterMany` does that per unit for a bulk action; `reserve`/`release`
  exist for a flow that learns after the fact whether it succeeded (a media
  upload that answers with a validation message). A controller never repeats the
  choreography.
- **A refusal is 402 with a code.** `insufficient_credits`, `owned_item_cap` and
  `anonymous_limit` all answer 402, because each is "you may ask, but not now,
  and the remedy is the plan". The body carries the code so the client shows the
  upgrade action instead of matching Arabic copy. A cap is checked _before_ the
  spend, so a refused create costs nothing.
- **Caps are checked at create, never over existing rows.** Admin accounts are
  exempt (their allowance is reported unlimited) and an account already over a
  cap keeps everything it has; only the next create is refused. `countOwned`
  excludes tombstones, so deleting frees the slot.
- **Local counters reconcile, they never block the server.** The scanner and the
  Quran reader count on the device and enqueue a `clientEventId`; the shell
  reports the queue (`POST /api/me/usage/local`, max 50 events) and
  `spend_credits_once` records each client event at most once, under the same
  advisory lock `spend_credits` takes. A lost response therefore costs nothing on
  replay.
- **The scanner still speaks to no server.** The count is written locally and the
  report is flushed by the app shell, never by the scan page: what leaves the
  device is an action key and a count, never the scanned content (ADR-0034). The
  visitor cap is enforced locally from the same seeded number, mirrored as
  `ANONYMOUS_DAILY_CREDITS_FALLBACK`.
- **The Quran charges a surah a day, and does not withhold the page.** Opening a
  surah records one `quran.surah.read` per day on the device; an empty allowance
  is reported on the account card and in the plan nudge, not by blanking the
  text. Reading the Quran offline is a promise this site keeps (ADR-0056).
- **The visitor subject is `HMAC-SHA256(salt, ip)`.** The salt is
  `ANONYMOUS_IP_SALT`, falling back to `MCP_TOKEN_ENCRYPTION_KEY` and then to a
  fixed local value so development stays runnable. Rotating it forgets every
  visitor's window, which is the intended effect.
- **Offline, the device refuses what it already knows.** The caps and the
  allowance are cached per account; a create past a cached cap throws before
  anything is written or queued. A refusal that arrives from the server is a
  permanent outbox failure — kept, surfaced and retryable, never dropped
  (ADR-0029).
- **A replayed idempotent create can cost one credit twice.** Links and posts are
  created by a `client_id`-keyed upsert, so an intent the server had already
  applied and that is replayed after a lost response charges again; the ledger
  records the request that reached it. Deduplicating per table's client id was
  judged worse than the occasional extra credit in a generous window, and the
  spend is visible on the account card. Local-counter reports are the exception:
  they are deduplicated by design.

## Amendment (2026-10-23): "enforceable on the server" means in Postgres

The amendment above treated `PlanGate` as the enforcement point. It is not: the
caps were counted in Node and the row inserted afterwards, in another
transaction, and the browser is handed the project URL and the publishable key,
so an `authenticated` caller could write past them through the Data API, and two
concurrent creates could outrun the count even through the app (#526).

- **The row-level trigger is the cap.** Every capped owned item has a
  `BEFORE INSERT OR UPDATE` trigger that counts the owner's live rows under an
  advisory lock keyed on `(user_id, item)`, reads the effective plan from
  `private.plan_window` and the caps from `plan_limits`, and refuses the write.
  The count and the insert are one transaction, which is the property Node could
  not give.
- **`PlanGate.cap` survives as a fast refusal**, so the common case still answers
  the upgrade nudge before doing any work. It is not what makes the rule true.
- **Grandfathering is unchanged.** Only a new row or a tombstone revival is
  checked; a live row being edited is not a new slot. Deleting still frees one.
- **The publication columns belong to the server.** `status`, `published_at`,
  `community_visible`, `view_count` and `featured` on `posts` are refused to the
  `authenticated` role, and the transitions (publish, save-and-publish,
  unpublish, schedule, feature, bulk publish, restore) run in `SECURITY DEFINER`
  functions that scope by `auth.uid()`. HTTP, MCP and the offline replay
  therefore take the same gated path, and none of them needs the service-role
  key.
- **Credits stay where they were.** The meter is still the request layer's, which
  is why a publish is charged once; only the standing caps and the publication
  rules moved into the write.
