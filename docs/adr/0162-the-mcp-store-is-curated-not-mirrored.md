# The MCP store is curated, not mirrored

[ADR 0155](0155-the-app-picker-hosts-apps-we-do-not-own.md) put the public registry behind the app
picker and listed every remotely reachable row, on the reasoning that a reviewed-only list would be
honest and would be empty. The first weeks of the screen settled the other half of that trade: the
registry is open and unranked, the list is alphabetical, and a member meets `com.vercel/vercel-mcp`
— with no title, no mark and no verdict yet — beside a stranger's weekend project and a house-painter
lookup. ChatGPT and Claude show a curated directory because a directory is a promise. This records
the change from mirror to store.

## The decision

1. **The registry is the source, not the screen.** Every active `streamable-http` row is still
   mirrored, so an admin can find a server by name and a member can never meet a row we did not
   store. The member's store draws only rows that are `verified_at is not null`, `connectable is
true`, `status = 'active'` and `blocked_at is null`.

2. **Verification is a human vouch, and it has a precondition.** `verified_at` is set by an admin,
   not by a probe. The probe is the precondition: an admin cannot verify a row it has not measured
   connectable, and the API refuses with its own sentence instead of storing a promise nobody can
   keep. A measurement that changes later still hides the row; the admin list shows it again.

   The first day is seeded, because an empty store is a store nobody visits. The six providers the
   plan measured connectable — Vercel, Linear, Supabase, Sentry, Canva and Cloudflare — are verified
   by the sync, and `verification_withdrawn_at` records an admin's withdrawal so the seed never
   overrules it. The probe still decides whether each one appears; the seed only saves an admin six
   taps on launch day.

3. **`null` and `false` are both absent from the store.** The three-state verdict stays useful in the
   Admin Console — «لم نتحقق بعد» is an instruction to probe, «لا يمكن ربطه» is a diagnosis with a
   reason — but a member's list is not the place to explain why a row cannot work. The store has
   nothing that cannot be linked.

4. **The probe stops lying about timeouts.** A server that never answered is `unreachable`, not
   `no_metadata`: the difference is what tells an admin whether to try again or to stop. The probe
   sends one request to the protected-resource document first, because the SDK's discovery collapses
   "404" and "connection refused" into the same throw.

5. **The store re-measures what it promises.** A verified row is probed on every sync, not only when
   a member draws it. A server that goes down stops being offered without an admin remembering it;
   a server that comes back returns the same way. The batch is small because the registry pass has
   already spent the run's budget.

6. **The order is curated, not alphabetical.** `featured_rank` then `registry_name`, two ordinary
   columns and one `order=` pair. Rank is a position, not a score; null sorts last. A curated store
   is small enough to draw in one query, so there is no keyset cursor that needs a second sort key.
   Without the order the first page is `ac.*`, `ai.*`, `app.*` — the registry's noise.

7. **Brand marks are ours to serve.** The registry's `icons` and the server's RFC 9728 `logo_uri`
   are captured into separate columns, so a daily sync cannot erase the mark the probe found, and
   the service prefers the probe's mark. The member's browser fetches `/mcp/icon?name=<row>`,
   never a third party: the proxy reads the stored URL through `backend/shared/egress`, serves only
   image types under half a megabyte, and answers a monogram fallback when there is nothing to
   serve. Hotlinking would leak the member's address and break when a provider blocks it.

   The Latin name is the same seam. `title_override` survives the sync, so `com.vercel/vercel-mcp`
   draws as **Vercel** rather than as the registry key, and the admin can correct a publisher's
   phrasing without waiting for an upstream edit.

## Consequences

- **The store's quality is an admin's workload.** The long tail stays searchable in the Admin
  Console and one action from approval; nothing is deleted from the mirror by curation. The trade is
  deliberate: a stranger's server is not one tap from a member's inbox.
- **A verified row can disappear without a deploy.** When the probe measures it unconnectable the
  store query stops returning it. That is the intended behaviour, and the admin list is where the
  reason is read.
- **A row with no mark is still offered.** The monogram is a fallback, not an admission rule: a
  verified server with no published icon is better than a hidden one.
- **The icon is resolved in the service, not the database.** The two sources are plain columns, so a
  sync and a probe never overwrite each other and neither costs a table rewrite. A stored generated
  column was the first shape of this change and the catalogue's statement timeout cancelled it; the
  service's `probe ?? registry` choice is the cheaper answer. The cancelled attempt's columns
  (`icon_url`, `icon_mime`, `store_key` and the index on it) stayed on the linked project afterwards,
  and `20261126100000_mcp_catalog_drop_generated.sql` removes them — by hand, because the safety gate
  refuses a `drop column` unattended. That file is their rollback note: each value is derived from
  columns this change already reads, so there is nothing to restore.
- **The app is a client of the same rule.** The native marketplace port reads the same contract and
  draws the same verified rows; it is switched on by `check:visual` like every other port.

## Alternatives considered

- **Keep the mirror and filter at render time.** Rejected: the filter is the store's promise, and a
  client-side filter still ships unverified rows to the client and hides the rule from the query.
- **Auto-verify every connectable row.** Rejected: it reproduces the mirror under a different badge,
  and "connectable" says nothing about whether the publisher is the brand it claims.
- **Hotlink the icons.** Rejected: the member's IP reaches every provider in the list, the images
  break when a host blocks hotlinking, and an SVG loaded from a stranger's origin is a document we
  did not choose to serve.
- **Add a manual `source` for hand-entered rows now.** Deferred: the registry already carries the
  official Vercel row, and the providers the registry lacks (GitHub, Notion, Stripe) need a
  pre-registered OAuth client before a row is useful. The static-client work owns that change.
