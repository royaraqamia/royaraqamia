# A field reads in the direction of its text

The chat composer put an English draft against the right edge. The page is
Arabic (`<html dir="rtl">`), the field inherited it, and `Hey` was drawn flush
right with the caret after the `y` — the reader's eye had to cross the whole
field to find the start of a four-letter word. The note and post composers did
not have the bug, and the difference was one attribute: their Tiptap surface
carries `dir="auto"` (`frontend/ui/notes/note-body-editor.tsx`).

`dir="auto"` is the obvious repair, and it is only half of one. It takes the
base direction from the first strong character of the _element_, so a message
whose second line is Arabic still renders that line right-to-left inside a
left-to-right block. In this product that message is ordinary rather than
exotic: a technical line and an Arabic explanation, a quoted English phrase in a
sentence that opens in Arabic. One direction per element makes one of the two
lines wrong.

## The decision

1. **`.bidi-lines` — `unicode-bidi: plaintext` — is the rule for anything that
   reads as a run of conversation lines**: the chat field, the message being
   edited, the bubbles, the reply preview and the assistant's streamed answer.
   `plaintext` makes the browser apply the bidi algorithm per paragraph, so every
   line takes its base direction from its own first strong character. It is what
   Telegram and WhatsApp have done for mixed text for years, and it is the only
   CSS-only way to state it.

2. **The field also carries `dir="auto"`.** The two are not redundant: `dir`
   fixes the base direction the caret and the empty field start from, and
   `plaintext` decides the ordering of the lines. A field with only `plaintext`
   still starts from a direction engines differ on while it is empty; a field
   with only `dir` has the bug this change exists to remove.

3. **It is one unlayered rule in the shell (`app/global.css`), not a per-surface
   class.** The chat bubbles and their editor render on two surfaces — `/chats`
   (`app/chats/app.css`) and the floating assistant
   (`frontend/ui/assistant/assistant.css`) — and ADR-0130's history is one long
   argument against owning the same rule twice. A hand-written rule in the shell
   needs no `@source` entry and cannot drift between the two.

4. **The rich-text editors keep `dir="auto"` and do not take `plaintext`.** Their
   placeholder rule (`:root[dir='rtl'] .tiptap p.is-editor-empty`) sets the empty
   paragraph's direction on purpose: the hint has to sit at the inline start of an
   Arabic composer before any strong character exists to detect. `plaintext`
   ignores that declared direction when it computes the paragraph level, so
   applying the rule to `.tiptap` would move the hint to the left of an
   Arabic-first note — the opposite trade, for a surface whose first-line
   direction already reads correctly.

## Consequences

- **A bubble is read line by line, and so is the field it was typed in.** What
  the member sees while writing is what the bubble shows after sending, which is
  the property the composer's own docblock asks for.
- **The direction follows the text, not the message's author.** An English line
  from an Arabic speaker reads like an English line from an English speaker, and
  the bubbles' `items-start`/`items-end` placement still says who sent it — the
  two signals stay separate.
- **`plaintext` on a `<textarea>` is the one place engines have differed
  historically.** Chromium is what this product ships in, and the composer's
  `dir="auto"` alone already fixes the reported case, so a browser that ignores
  the rule degrades to per-field direction rather than to the bug.
- **This is the rule for the next surface that shows written conversation.** A
  new field, bubble or preview joins by naming the class; it does not get its own
  direction logic.
