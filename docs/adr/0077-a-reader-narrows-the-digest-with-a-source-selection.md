# A reader narrows the digest with a source selection, and the fetch never changes

A signed-in reader can keep a subset of the Source List in `/account/news`, and `/news` shows only
their sources' stories. The selection is a **read-side filter** over the one shared digest: the
workflow still fetches the whole list, still asks the model once, and still publishes one validated
Digest per day (ADR-0076).

The alternative — let each reader's selection change what the agent fetches — was rejected for the
reason ADR-0076 exists. One digest per reader means one fetch, one model call and one validation per
reader per day, a per-reader failure surface, and a source list that is no longer the thing the
validator checks against. The page would also stop being a cheap read: it would wait on a run, not
on a table. What the reader actually asked for — "show me my sources" — the filter gives in the same
request, for no marginal cost, and the published copy stays the copy that was reviewed.

Three details follow from that decision:

- **The selection stores what was kept, not what was hidden.** An empty list means "everything", so a
  source approved later is visible to readers who saved a selection before it existed. Storing
  exclusions would silently hide every future source from every existing reader.
- **A selection that leaves fewer than three stories is ignored for that day.** Filtering is a
  preference, not a way to empty the page: the full digest is shown with a notice and a link to the
  picker. Without a floor, ticking two quiet feeds on a slow day reads as a broken site.
- **Search is not narrowed.** Search covers the retained month as published; applying the selection
  there would make the search box quietly deny stories the site has, which is worse than showing a
  reader a source they hid.

The stored ids are validated against the catalogue before the write and again on read; an id the
catalogue no longer carries is dropped rather than refused, because dropping can only widen what the
reader sees and a stale row must stay editable. The catalogue is read from the same
`data/news/sources.json` the fetch uses, so nothing can be selectable yet unfetchable.

## Considered options

- **Per-reader fetch and generation.** Rejected for now: unbounded model spend, a per-reader publish
  path, and the reviewed-list guarantee traded for a prompt. It returns only if news is metered, and
  even then the fetch stays shared (`docs/adr/0076-…`).
- **Store the excluded sources.** Rejected: every source approved afterwards would be hidden from
  every reader who had ever saved a selection, which is the opposite of what "keep my sources" means.
- **Filter in SQL** (`.in('source_id', ids)`). Rejected: the day's first read is already cached by the
  page path, the digest is a dozen rows, and filtering in the service keeps the fallback rule — a
  count, not a query — next to the copy that explains it.
- **No account row; remember the selection in the browser.** Rejected: the selection is meant to
  follow the reader across devices, the account area already owns preferences, and an anonymous
  visitor can read the whole digest without one.

## Amendment (2026-10-24): the page no longer announces the fallback

The floor still applies — a selection that leaves fewer than three stories shows the full digest —
but `/news` no longer says so. The digest's summary card (date, title, lede, story count and the
last-updated line) came off the page, and the fallback notice lived inside that card, so the page now
opens straight onto the story list. The narrow-to-selection behaviour and the "search is not
narrowed" rule are unchanged.
