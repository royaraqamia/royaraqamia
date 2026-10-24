# A reader may propose a source, and approval is a row rather than a deploy

Readers can submit an RSS/Atom feed from `/account/news`. The server probes it (a real document, at
least one item), the proposal lands in `news_source_requests` as `pending`, and an Admin accepts or
rejects it in `/admin/news`. Accepting writes one row to `news_sources`; the daily fetch merges that
table on top of `data/news/sources.json`.

The guarantee ADR-0076 built does not change: a model may select but never find, and every fetchable
feed was reviewed by a person first. What moves is where the review happens. Editing the JSON in a
pull request is still a review, but it costs a branch, a CI run and a merge for a one-line feed — and
the person best placed to judge a Syrian or Islamic-world feed is not always the person who can land
a PR. A queue plus a table keeps the review and drops the ceremony.

Three constraints make the table safe enough to fetch from:

- **Only an Admin writes it.** `news_sources` has public read (the picker offers an approved source to
  every reader, exactly like the repo list) and no write policy at all; the decision path runs behind
  `withAdminUser` on the service role, and it is the only code that inserts.
- **The file still wins.** `mergeSources` keeps the repo list and appends only rows whose id and URL
  are new, so an approved row can add a source but never override or shadow a reviewed one. A
  duplicate id would also collide with the candidate ids (`<source>:<n>`).
- **A broken addition cannot cost a day.** The merge reads the table with a timeout and falls back to
  the file on any failure, and a malformed row is dropped by `toApprovedSource` rather than thrown on.
  A new feed is worth having; it is not worth an empty morning.

The reader side is deliberately thin: one open proposal per account, one open proposal per URL, three
probes a day, and no way for a reader to move their own row out of `pending` (there is no update
policy). The probe is a usability gate, not a trust decision — it answers "would the fetch get
anything from this?", and the approval is still a person's. The row's id is derived from the host
(`example-com`), suffixed when it collides, because that id becomes `news_stories.source_id` and must
stay a stable slug.

## Considered options

- **Admin edits `data/news/sources.json` in a pull request.** Rejected as the flow: correct review
  discipline, wrong latency — a source request would wait on a release, and the queue that tells the
  reader what happened to their proposal would not exist.
- **No queue; readers write `news_sources` directly with `enabled = false`.** Rejected: a pending row
  is not a source, and letting a reader create a fetchable-shaped row puts a public form one flag away
  from the fetch.
- **Fetch every proposed feed, then let the digest decide.** Rejected: that is the "let the model
  find" failure with extra bandwidth; an unapproved feed's items would enter the candidate list.
- **Per-reader additions only (the requester's own digest).** Rejected: a reviewed source is useful to
  every reader, and a second visibility dimension would complicate the selection for one extra row of
  bookkeeping.
