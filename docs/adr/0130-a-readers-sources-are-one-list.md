# A reader's sources are one list

The account page drew the same link twice. Above the fold it was a _feed_:
the name the resolver read, the URL it fetches, a health badge (`يعمل` /
`توقّف عن العمل`) and a delete. Below the fold it was a _proposal_: the URL the
reader pasted, a state (`جاري التحقّق`, `يحتاج مراجعة`, `مقبول`, `مرفوض`) and
whatever reason came with it. Both lists were the reader's own sources, and the
only thing that separated them was which table the row had reached.

The page therefore answered "where is my link?" with a different place depending
on how far along it was, and the answer moved while the reader watched: a link
they had just added appeared in one list, then vanished from it and appeared in
the other when the worker accepted it. The two lists also disagreed about what a
delete means — one had a trash button, the other had none — so a reader who
wanted to take a pending link back had no control at all.

## The decision

One section, one list (ADR-0106's own sources, ADR-0098's pair). A row is the
request until the resolver accepts it and the feed afterwards:

- `جاري التحقّق` (resolving), `جاهز للمراجعة` (ready), `يحتاج مراجعة`
  (needs_review) and `مرفوض` (rejected) come from `news_source_requests`;
- `يعمل` (live) and `توقّف عن العمل` (broken) come from `news_user_sources`.

An accepted row is never drawn from the request table: the feed is the row, so
approval is not a state a reader sees, it is the moment the badge becomes
`يعمل`. The single endpoint (`GET /api/me/news-private-sources`) answers both
halves, ordered by `created_at`, so no client has to join two lists and no row
can go missing between them.

The field that files a link sits at the top of the same section, under its own
`أضف مصدرًا` heading, and the rows land under it. The page keeps the reader's
catalogue checklist above, unchanged.

Every row carries a trash button, and every delete asks first. The confirmation
speaks the row's own situation: a feed's removal stops its fetching, a pending
link's cancellation ends the wait, and a refused row's removal clears the
record. A delete of a request is new — `news_source_requests` gains an own-row
delete policy for rows that have no source, and the repository's `user_source_id
is null` filter is what keeps an accepted row's history out of reach.

## What this replaces

The account page's third island (`NewsSourceRequestForm`'s list) is gone. The
form itself stays; the states it used to print move into the one list, and with
them the failure sentences (`لم نجد خلاصة RSS…`, `تعذّر الوصول إلى الرابط.`) and
the Admin's note, which are what "refused" means to a reader.

## Consequences

- **The plan's ceiling counts both halves.** Submission already counts held
  sources plus open requests against `news_private_sources`; the badge now says
  the same number, so the page cannot promise a slot the next submit refuses.
- **A broken feed keeps its row.** It is still the reader's, with a notice above
  the list and the fetch's last sentence on its badge; removing it is one
  confirmation away.
- **The admin queue is unchanged.** `needs_review` still goes to an Admin, and an
  approval there writes the feed into the same list.
- **The Kotlin port follows.** `NewsPrivateSourcesCard` draws the field and the
  rows together, and `NewsSourceRequestCard` is the field alone; both are still
  one pair with the page (`docs/mobile/parity.json`).

## Considered options

- **Keep two lists and label them better.** Rejected: the split was the problem,
  not its wording. A reader with a pending link and two working feeds has three
  sources, not two sections.
- **Draw only the request table and join the feed's health into it.** Rejected:
  an accepted request can outlive its feed (the reader deleted it), and an
  approved row with no source would then be drawn as a source that does not
  exist. The feed is the row while it exists.
- **Delete a request by marking it `rejected` with no note.** Rejected: a
  reader's cancellation is not an Admin's refusal, and the reader would keep
  seeing a row they asked to be rid of.
