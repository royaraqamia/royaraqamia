# The Quran text and Tafsir ship with the build; only recitation audio is fetched from a CDN

The reader is offline-first (ADR-0027), and the Quran's text is the one dataset in the product
family that is fixed, public and small: the Uthmani text of Hafs ʿan ʿAsim is a few megabytes raw
and roughly one compressed, and التفسير المختصر is of the same order. So the text, the Mushaf
layout and the Tafsir are static assets in the build, served from our own origin and cached by the
service worker, and no third-party API is consulted on a page view. Only recitation audio —
hundreds of megabytes per Reciter — is streamed from a CDN on demand, never bundled and never
precached.

## Considered Options

- **A Quran API at read time, or a server-side snapshot of one.** Rejected: it puts a third party in
  the path of every page view, hands an external service a rate-limit veto over the product, and
  makes a first load without a network impossible — contradicting ADR-0027. A snapshot would also
  earn its own cache table and an ingest schedule (the Exchange Rates shape) for a dataset that
  never changes between releases.
- **Bundling the text into the JavaScript bundle.** Rejected: megabytes on the critical path against
  the performance budget. It is fetched as data and cached, never imported as a module.
- **Serving recitation audio from our own origin.** Rejected: no asset we would serve is worth that
  egress, and a CDN already does it better.

## Consequences

- A text correction, a layout fix or a Tafsir addition is a commit and a deploy, not an admin
  action. That is the deliberate no: there is no admin surface for this product.
- A deploy that changes text must version the cache name, or a reader keeps reading the old copy
  (the ADR-0042 worker-swap path already reloads the document when a worker is replaced).
- Which edition, which Reciters and which CDN are vendoring choices recorded in the repository, not
  runtime configuration.
