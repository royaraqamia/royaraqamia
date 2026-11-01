# The empty editor names itself

The note and post composers open on a rich-text surface that, when empty, was a
blank box. `NoteBodyEditor` passes a `placeholder` to Tiptap's `Placeholder`
extension, which decorates the empty block with `data-placeholder` and the
`is-empty`/`is-editor-empty` classes — and draws nothing. The extension leaves
the words to the stylesheet, and no stylesheet in this repo ever mentioned them,
so the prop had never been visible.

Removing the note title made it matter: the composer is now one field, and an
empty one had no other cue about what it was for.

## The decision

- **The shell stylesheet draws it**, in `app/global.css`, next to the editor's
  toolbar scrollbar: `content: attr(data-placeholder)` on
  `[data-placeholder]::before`. The editor is shared by Notes and Community, so a
  surface stylesheet would be a second copy of the same rule.
- **The selector is the attribute, not the class.** Tiptap attaches
  `is-editor-empty` for the whole document and `is-empty` for a single block; the
  attribute is on every block it decorates, which is exactly the set that should
  paint.
- **It is a zero-height float at the inline start**, so the hint does not take a
  line of its own and sits where typing begins. `pointer-events: none`, because a
  hint is not a target.
- **The empty block follows the page's direction.** The editable surface carries
  `dir="auto"` so an English note reads left to right — but `auto` has no strong
  character to read while the block is empty and falls back to LTR, which put the
  caret and the hint on the left of an Arabic-first composer until the first
  keystroke flipped both. `:root[dir='rtl'] .tiptap p.is-editor-empty` pins the
  empty block to the page; the moment there is text, the decoration is gone and
  `auto` takes over again.

## Why not the alternatives

- **A separate overlay element positioned over the editor**: a second thing to
  keep in step with the document's first block, its scroll and its padding, to
  draw text the extension already hands us.
- **Tiptap's canonical snippet verbatim** (`float: left`): it strands the hint on
  the left of every RTL surface, which is all of them here.
- **Removing `dir="auto"` and letting the editor inherit RTL**: it fixes the empty
  state by breaking every note written in Latin, which would stay right-aligned
  and bidi-perverse for as long as it exists.

## Consequences

- The hint is one CSS rule; a surface that wants different words passes a
  different `placeholder` prop and needs no new style.
- `e2e/notes.spec.ts` asserts the painted `::before`, not the attribute, and that
  it is gone after the first keystroke — a component test could not tell the two
  apart, which is how this stayed invisible.
