# 0217. A comment thread has a host, a block and a report

## Status

Accepted. This is the decision #1575 asked for; the code arrives in the implementation issues named below.

## Context

#1573 shipped comments with one rule: the writer may edit and delete their own. Everything else —
who may remove a reply, what a block means in a thread, whether a hidden member's words still draw,
where a report goes, whether staff edit, and whether a thread needs a cap — was deliberately left
undecided. #1576 adds the notification that tells a post's author about each reply, which makes the
author the person already present at every comment.

The surrounding rules are settled and constrain the answer. `public.blocks` is one block list for
the whole site: `following_feed` hides a blocked pair in both directions through
`private.not_blocked_with`, and `private.chat_can_write` refuses the blocked writer at the insert
policy (20261128120000). A hidden member is a row nobody lists, but ADR-0127 point 5 explicitly
leaves their content untouched. Admin is an email allowlist (ADR-0003), not a staffed moderation
team. Reports already have a shape — `chat_reports` freezes evidence into `snapshot` so staff read
a copy built by the database, not a client payload (ADR-0113) — and a home, the Admin Console's
`/admin/reports` queue. Notifications are fail-safe producers that never throw, so they are a
pointer, never a work item.

## Decision

1. **The post's host may remove a reply, not edit it.** A comment is removed by its author or by the
   author of the post it sits on. The database is the authority: the removal function takes the
   actor id and checks the post's owner, and tombstones with `deleted_by` and `deleted_reason` so
   self-delete, host-removal and a later staff removal share one audit seam instead of a second
   table. `edited_at` still means the writer edited their own words. The host is already notified of
   the reply (#1576), which makes them the first line of moderation; an email-allowlist admin team
   cannot be. X's model assumes a moderation queue this product does not have.

2. **A block hides the author in both directions and refuses the write.** Thread reads filter
   blocked authors out before the keyset `limit`, so a page still holds a full page of rows. The
   filter runs in a security-definer read that takes an optional viewer id: RLS on `blocks` only
   shows a member the rows they wrote, so a policy-level check would see one half of the pair.
   `post_comment_create` refuses a comment when either side has blocked the other, for the same
   reason chat refuses the blocked writer. `post_engagement_counts` stays viewer-independent and
   public — a blocked viewer may see a `total` above the number of rows they can read. The
   comments route is already `NO_STORE`, so resolving an optional session for the read costs no
   caching property. A "show anyway" collapse is not built now: it would put a per-row viewer flag
   in the shared contract, per-client toggle state that has to survive paging, and a count that
   disagrees with the feed's. It can be layered on a filtered read later without a contract change.

3. **Hidden members' comments keep drawing.** `authorsByIds` stays unfiltered. ADR-0127 point 5
   decides this: hiding a row from a directory is not a statement about what its owner wrote, and
   one flag must not quietly become two meanings. Writing may be gated on `verified` — a public
   byline is a confirmed-identity act — but never on `is_hidden`. Misuse of a hidden account is
   handled by removing the comment, not by flipping the flag.

4. **Reports go to the Admin Console.** `post_comment_reports` follows `chat_reports`: a frozen
   JSONB snapshot captured by a database function from the real rows, a bounded reason, a unique
   `(reporter_id, comment_id)`, `open`/`reviewed`/`dismissed`, a per-member write budget, and a
   queue beside chat reports at `/admin/reports`. An admin notification is a deep link into that
   queue, not the source of truth: the producer is fail-safe, so a notification-only report could
   be lost with no state left to find. The reported author is not notified. The only staff action
   is a removal carrying the report id and the reason; there is no moderation tool in the MCP
   registry, and the `#1575` placeholder in `mcp-capabilities.ts` stays empty.

5. **Staff never edit a member's comment.** Editing changes authorship and makes `edited_at` lie.
   An honest removal with an audit reason, or a staff reply, is the available act. If redaction of
   accidentally published personal data is ever required, that is a separate decision with an
   explicit system marker and its own audit column — not an extension of the writer's edit path.

6. **There is no per-post comment cap.** Keyset paging already bounds every read, and the count is
   one aggregate. Abuse comes from a member, not from a popular post: the existing 10-per-5-minutes
   budget, block refusal and report-and-remove address the source. If a hot post ever needs a
   lever, use a per-(post, member) cooldown rather than a hard total.

## Consequences

- The public `total` is explicitly viewer-independent. The contract says so, so a client does not
  mistake a higher number under a blocked viewer for a failed filter.
- A tombstone carries who removed it and why. Reads still filter every tombstone out, so the thread
  looks the same to a reader; the columns exist for the Admin Console and for a future author-facing
  history, not for a new visible state.
- Block filtering moves the thread read from a plain table select to a security-definer function.
  That is the same shape the feed and chat already use for the same rule, and it keeps the block
  check next to the rows it protects.
- The ADR closes #1575. The code is split into four implementation issues, one per piece, with the
  host-removal audit columns and the verified write gate folded into their natural pieces.

## Alternatives considered

- **X's model, where only the writer or a moderator removes a reply.** Correct only with an actual
  moderation team. Here the post's author is the person notified of every reply and the owner of
  the space; without host removal, every piece of spam on a post becomes an Admin Console job.
- **Hide only what the viewer blocked, not what blocked the viewer.** That makes a block a mute
  rather than a boundary, and it contradicts `following_feed`, which already hides both directions.
- **Collapse behind "show anyway".** Viewer state per row in both clients, a toggle that must
  survive keyset paging, and a public count that cannot be reconciled with the filtered rows.
- **Suppress a hidden member's comments.** ADR-0127 point 5 rejected a flag becoming both a
  directory rule and a moderation rule; this would repeat that mistake one surface later.
- **Route reports through the notification bell.** A fire-and-forget producer has no status, no
  evidence snapshot and no queue. The Admin Console already owns work items with state.
- **Allow staff to edit.** Ghostwriting with `edited_at` attached, which attributes a changed
  sentence to the member who never wrote it.
- **A per-post cap.** Punishes popular posts without closing an abuse path; the read side is already
  bounded by the page size.
