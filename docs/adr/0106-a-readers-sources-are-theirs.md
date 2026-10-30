# A reader's sources are theirs; the catalogue is decided

ADR-0105 made the reader's submission reliable — paste anything, the system works out what it is.
It left the answer in the wrong place: every resolved link went into the public catalogue through an
Admin, which meant a reader who wanted one quiet blog waited on a queue, and the catalogue grew by a
row every time someone tried a link. Two readers asking for the same feed were one entry, and neither
of them owned it.

## The decision

- **A resolved link becomes a private source.** `news_user_sources` holds one row per reader per
  feed. It is not in the catalogue, it is not in the picker, and no other reader can see it. The
  worker accepts it in the same transaction that answers the request (`accept_news_private_source`),
  so "we will check it" ends with a source, not with a queue position.
- **The catalogue keeps its own path.** An Admin still decides what every reader is offered. A
  `needs_review` row — one the resolver could not convert — is the only thing that reaches the queue,
  and its decision names a destination: the reader's list (the default), or the catalogue.
- **The plan caps the list.** `news.private.sources` is a `plan_quotas` row (Free 1, Pro 10) and a
  trigger on insert. The service refuses before writing, with a sentence that names the cap; the
  trigger is what makes the cap true under two racing requests.
- **A broken feed is a state, not silence.** The daily fetch reports each private source's health
  back: a failure increments `failure_count` and stores `last_error`, a success resets it, and three
  consecutive failures set `broken` and stop the fetch. The owner sees «توقّف عن العمل» and the fix
  is to add the link again or remove it. Nothing is deleted for them.
- **A feed is fetched once, read by everyone who holds it.** Two readers may add the same URL; the
  fetch deduplicates by URL and hands each owner the items under their own source id, so the work is
  bounded by distinct feeds rather than by rows.

## Why not the alternatives

- **One `news_sources` row with an owner column** would have put a private feed in the same table the
  catalogue query reads, so every read would need a policy to exclude it, and the "public" picker
  would be one missed `.eq()` away from leaking someone's list. A separate table cannot leak by
  accident.
- **Auto-accepting into the catalogue** is what the feature would have been if "anyone can add
  anything" were the goal. It is not: the catalogue is an editorial promise (ADR-0076), and a
  personal list is not.
- **A second fetch pipeline per reader** (fetch on demand, per digest) would make cost proportional to
  readers instead of to feeds, and would put an outbound request behind a page load.

## Consequences

- **The personal digest is the only place a private source appears.** A reader who adds one with
  «مُلخَّص خاص بي» off sees nothing; the account page says so and points at the toggle. Turning it on
  is the reader's choice because generating it costs credits, so nothing turns it on for them.
- **`personal_enabled` is not implied by adding a source.** That is the cost of not spending a
  reader's credits on their behalf; the copy carries the consequence.
- **The `needs_review` queue is smaller and more expensive per row**, because every row in it is a
  link the machine could not read. An Admin's job is now the exception, not the default.
- **Three consecutive failures is a judgement, not a measurement.** A weekly feed can be down for
  three daily runs and come back; it lands `broken` and the owner adds it again. The alternative —
  retrying forever — is a source that looks alive and never publishes.
- **Two partial indexes were renamed in place.** `uq_news_source_requests_open_user` is now unique on
  `(user_id, url)` and `uq_news_source_requests_open_url` is an ordinary index: two readers asking for
  one feed is the normal case now, and one reader asking twice is not.
