# A note is its body

A note collected a title and a Markdown body. On a phone that was two fields
competing for the height the keyboard had already halved, and the title was
usually the first line written anyway — «قائمة الشِّراء», «موعد الطَّبيب» —
duplicated into a second box before the writer could start. The community post,
written in the same composer, has never had one.

## The decision

- **There is no title field.** The composer and the editor are the body, and a
  note opens straight into the text.
- **The first line names the note.** The list row's bold line is the first line
  of the body that says something, its Markdown markers stripped; the preview
  under it is the rest of the text, so a row never prints the name twice. An
  empty note is «بدون نصّ». This is how Apple Notes and Google Keep read.
- **The removal is end to end**: `title` leaves `Note`, `NoteWriteSchema`,
  `NoteUpdateSchema`, the Outbox payload, the Notes repository, the API and the
  `notes` table (`20261102090000_notes_without_a_title.sql`).
- **The text of an existing title is not carried into the body.** It was the sum
  of what the writer already had in the body; inventing a first line by moving a
  column would either duplicate a heading or splice two unrelated paragraphs. A
  note opens on what its body says, and the column's content goes with it.
- **A body-less row is still listable.** The list names a row with
  `noteName(body)` rather than a field, so a tombstoned or blank note cannot
  break the search index, the undo toast or the delete confirmation.

## Why not the alternatives

- **Keep the column and stop collecting it**: a `not null default ''` column that
  no read or write names is a second schema to keep in step with the contract for
  no reader's benefit — and every row pays for it.
- **Fold each title into the body as a leading line**: a one-time backfill over a
  user table (forbidden without approval anyway) that rewrites what a reader sees
  in a note they already wrote.
- **Derive the name from the first line at write time and store it**: a copy of
  the body's first line that drifts the moment the writer edits that line, and a
  merge conflict on the name instead of on the text.
- **A fixed «ملاحظة» label for every row**: the rows would be distinguishable
  only by preview and timestamp, which is the least scannable list of the three.

## Consequences

- The composer is one field, which is also why the phone surface can give the
  keyboard the whole height (ADR-0109).
- A note is only as findable as its text: search now reads the body alone, so the
  words a title used to add to the index are the words the body holds.
- An older client still sending `title` is understood — the Zod object strips the
  unknown key — and its own local rows keep a field nothing reads.
- The migration is destructive and stays pending until a person approves it
  (`scripts/check-migration-safety.mjs`); until then the column simply defaults
  and nothing writes it.
