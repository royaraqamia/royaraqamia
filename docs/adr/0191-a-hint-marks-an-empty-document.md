# A hint marks an empty document, not an empty line

Two things were wrong with the same field, and they were the same mistake seen
from two sides. The post and note composers are Markdown documents rendered by
Tiptap, so Enter creates a paragraph. Prose gives every paragraph 1.14em of
margin on each side, and the composer read that as a visible gap — a line break
that looked like a new block. And Tiptap's `Placeholder` decorates _the empty
block the caret is in_, while the stylesheet painted every decorated block, so
the moment someone pressed Enter the hint «اكتب ملاحظتك هنا…» reappeared under
their own sentence. The composer looked like two fields, one of them empty.

Neither is the extension behaving badly; both are the field inheriting a rule
written for a different question.

## The decision

1. **Enter stays a paragraph.** The stored format is Markdown and the readers
   are `react-markdown` with `remark-gfm` only — no `remark-breaks`. A soft break
   (`Enter` → `<br>` → turndown's `  \n`) is a _space_ to that renderer, so a note
   typed with plain Enters would publish as one run-on paragraph on
   `/community/[slug]` while the composer showed neat lines. Paragraphs are also
   the only way to start a list, a heading or a quote by typing at a line start.
   `Shift+Enter` remains the deliberate soft break for the writer who wants one.

2. **The gap becomes a line's, not a block's.** `prose-p:my-1.5` on the editor
   surface: six pixels between paragraphs at this size, less than the line
   itself, so consecutive paragraphs read as lines while still being paragraphs.
   Lists, headings, quotes and code keep prose's own spacing — they are meant to
   be blocks.

3. **The hint is painted only for `is-editor-empty`.** That class is what the
   Placeholder extension adds when the whole document is one empty block, which
   is exactly the state the words describe. The bare `[data-placeholder]`
   selector it replaces treated "the caret is in an empty paragraph" as the same
   thing; it is not, and the two surfaces had been showing the difference ever
   since Enter worked.

4. **The rule stays in `app/global.css`.** The composer's mark-up is Tiptap's and
   the surface is compiled per route; a hand-written shell rule covers every
   editor the product opens (notes, posts, the editor pane) without a `@source`
   entry per surface.

## Consequences

- **A paragraph still separates on the post page.** The published article keeps
  its own `prose-lg` spacing, which is right for reading; only the writing
  surface is tightened. A note preview in the list is unstyled text, so the
  change cannot reach it.
- **The empty-block hint no longer doubles as a "you are here" marker.** Someone
  who wants to check which block they are in has the caret; the hint is words,
  and words that describe an empty note should not appear inside a full one.
- **The measurement is in the guest spec.** `e2e/notes.spec.ts` presses Enter in
  the real composer and asserts both: no painted hint, and a gap smaller than the
  line height. A CSS-only change with no browser assertion is how these two
  survived review the first time.
