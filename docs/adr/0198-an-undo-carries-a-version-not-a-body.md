# An undo carries a version, not the post's body

A delete is a tombstone (ADR-0029), so the row it hides still holds its content, its metadata and
its tags. The undo therefore has nothing to copy back: `restore_post` clears `deleted_at` and leaves
every other column exactly as it stands. What the client sends is the handle (`id`, or a `slug` for
an older client) and, when it has one, `updatedAt` — the stamp the delete answered with.

That stamp is the version the undo was based on. A tombstone whose `updated_at` has moved on since
refuses with a `P0004`, which the repository answers as `412` and the client shows as a sentence the
member can act on ("تغيَّر المنشور بعد الحذف، فأعِد تحميل الصَّفحة لتستعيد أحدث نُسخة.") instead of
overwriting a post they are no longer looking at. The delete answers with the stamp it wrote, which
is why the page can offer the undo without keeping a copy of the body.

`412` rather than `409` is deliberate: both clients classify `409` as "later" and would replay an
undo that can never apply (ADR-0029's retryable set). A stale undo is permanent on both.

The token is optional. A client that does not send one — an older bundle, a shipped APK — still
revives its own tombstone, and that is safe now that nothing but `deleted_at` moves: the revive
cannot lose an edit, and the only thing it can get wrong is offering the undo at all.

## Considered Options

- **Keep sending the four content fields and compare them.** Rejected: the body is the thing that
  is stale, so it cannot also be the thing that decides whether it is stale.
- **A server-side restore token (a random column on the row).** Rejected: `updated_at` already
  carries the write order the delete and the offline replay both use, and a second clock would have
  to be kept in step with it.
- **Refuse an undo with no token.** Rejected: it breaks the undo of every client already installed
  for a safety property those clients already have, since the revive no longer writes content.
- **`409`, the obvious status for a conflict.** Rejected: it is in the retryable set both outboxes
  share, so the queued undo would back off and replay forever instead of telling the member.

## Consequences

`restore_post` drops and recreates with a `text` return (the revived row's slug), so the controller
revalidates the page it actually brought back rather than the one the request named; the grants are
reissued in the same migration. The request contract loses `content`, `cover_image`, `meta_title`,
`meta_desc` and `tagIds`, which regenerates the app's `RestorePostSnapshot` and makes a client that
still sends them a compile error rather than an ignored field. On the device the undo keeps the
tombstone's `updated_at` locally: the server's revive is the newer write, so the pull is what
corrects the body when another device had already edited it.
