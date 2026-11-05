# The personal digest is on for every account

ADR 0079 made the reader's own digest an opt-in: `news_source_preferences.
personal_enabled` started false, the account page offered a switch, and a
private source was read by nothing until the reader turned it on. The reason was
cost — generating a digest is metered (`news.digest.generate`), so spending it
was the reader's decision.

The cost argument does not survive the queue it produced. `personal-digests.mjs`
already skips a reader with no catalogue selection and no private source: their
personal digest would be a copy of the shared one. Every reader who would pay
is a reader who narrowed the catalogue or added a feed of their own — a reader
who has already said what they want. And the switch was the one thing standing
between "I added my channel" and "my channel's stories never arrive", which is
exactly the failure ADR-0106's 2026-11-04 amendment was written about: a reader
with three ready channels, a digest every morning, and not one story from them.

## The decision

The digest is delivered to every account. The switch, its copy and the enable
route (`PATCH /api/me/news-private-sources`) are gone, and the endpoint's
`personalEnabled` field with them. The database keeps the column — the nightly
workflow and the board still read it — but it defaults to true and every stored
row is backfilled, so a reader who once turned it off is not stranded by a
control they can no longer reach. A preference write writes true, so a row saved
before this change comes in line the next time it is touched.

The board no longer has an "off" branch either: `NewsPersonalView.enabled` is
removed, and the own-source notice only ever says "nothing from your sources was
published today" (with the link to the account page), because "your digest is off"
is no longer a state.

A reader who keeps the whole catalogue and holds nothing of their own still gets
the shared digest, unchanged: the nightly run skips them by construction, so the
switch was never what was protecting their credits.

## Consequences

- **Cost follows intent, not a toggle.** A narrowed selection or a private source
  is the signal; the rotation (`last_personal_digest_at`) bounds how many are
  generated per night, exactly as before.
- **A new account is not charged for nothing.** No row, no selection, no sources:
  the run skips them.
- **One less control to explain.** The account page is the catalogue checklist
  and the one list of the reader's own sources (ADR-0130); nothing there switches
  delivery on or off.
- **The app's screen drops the same switch**, from the same generated copy source.

## What this supersedes

ADR 0079's opt-in clause and ADR 0106's "`personal_enabled` is not implied by
adding a source" consequence. The digest itself — the same candidate list,
narrowed to the reader, published after the shared one — is unchanged.
