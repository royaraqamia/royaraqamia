# The send button is the only way to send

The chat composer (`frontend/ui/chats/chat-composer.tsx`, drawn by the member's thread and the
assistant's) used to send on `Enter` unless `Shift` was held, and its textarea stayed one row tall:
anything past the first line was typed into a field that never grew, so the member read their draft
through a one-line window. Both are the opposite of the row WhatsApp and Telegram trained everyone
to expect. A member writing in Arabic with a keyboard, and especially on a phone where the return key
sits under the thumb that is already typing, lost a half-written message to a stray `Enter` — or
could not see the two lines they had written.

## The decision

1. **`Enter` adds a line, always.** The composer's key handler is gone: no key, with or without a
   modifier, sends. The field keeps the browser's own behaviour, and `enterKeyHint="enter"` asks the
   phone keyboard for a return key rather than a send key. A form never submits from a textarea, so
   the row's `<form>` cannot send either.
2. **The send button is the only send path.** It is still the row's end slot, still a submit button,
   and it is the one control that calls `onSend`. The microphone's release-to-send and a finished
   voice note are sends of a different kind and are untouched.
3. **The field grows one row per line, to a ceiling of 128 px, then scrolls inside.** The height is
   recomputed from `scrollHeight` on every change, so deleting a line gives the height back and a
   cleared draft returns the one-row field. The fit also runs when the field's width changes, because
   the same sentence wraps differently in a wider panel. 128 px is about five lines at the field's
   14/20 text size and is already Tailwind's `max-h-32`, so CSS and the script agree on the ceiling.
4. **The app draws the same pair.** Compose's `OutlinedTextField` already inserts a newline and grows
   (no `ImeAction.Send` is set), so the Kotlin change is the ceiling: `maxLines = 5` on the thread's
   composer and the assistant sheet, with the assistant sheet's height bounded at 128 dp as well. The
   chats port is still switched off; this keeps the pair honest without enabling it.

## Consequences

- A message can now be multi-line, and the thread already renders `whitespace-pre-wrap`, so the line
  breaks survive the send; the send trims only the ends (`body.trim()`).
- A phone keyboard's return key no longer sends as a side effect, and a desktop member presses the
  button or taps it with the pointer; muscle memory from other chat apps will send nothing until
  they do.
- `max-h-32` and `FIELD_MAX_HEIGHT_PX` are one number in two places; changing the ceiling means both.
- The composer's height is a layout effect, so it is measured before paint: no flash of a one-row
  field with three lines in it.

## Alternatives considered

- **Keep `Enter` as send and `Shift+Enter` as a line.** Rejected: it is the behaviour being removed —
  a keyboard key that sends is what loses a half-written message to a hurried press, and what a
  switch or voice-control user hits by accident.
- **Send on `Ctrl`/`Cmd+Enter` as a power-user shortcut.** Rejected by the request: nothing on the
  keyboard triggers the send action.
- **Let the field grow without a ceiling.** Rejected: on a phone it pushes the thread off screen, and
  neither WhatsApp nor Telegram do it.
- **A CSS-only growth (`field-sizing: content`).** Rejected for now: it is newer than the browsers the
  site supports, has no ceiling of its own, and jsdom could not exercise it, so the contract would go
  untested.
