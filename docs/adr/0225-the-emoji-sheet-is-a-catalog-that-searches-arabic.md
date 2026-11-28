# 0225. The emoji sheet is a catalog that searches Arabic

## Status

Accepted (2026-11-27). Adds the emoji sheet to the rich field the chat composer
and the comment row share, so the member thread, the assistant thread, the
floating panel and a post's comment field all offer one. Extends ADR-0098 (a
ported component is a pair) and follows the lazy-boundary rule in
[docs/specs/offline-first.md](../specs/offline-first.md).

## Context

`ChatField` draws one paragraph of inline marks and no emoji: a member can write
«عريض» and a link, but not a smile. The three chat surfaces share `ChatComposer`,
and the post's comment row shares the same field (`PostCommentField`), so one
field is the only place the feature can live without a fourth composer drifting
from the other three.

The obvious implementation is a picker library. The ones that exist index their
search on English names and keywords: `emoji-mart` and `emojibase` ship an Arabic
UI translation, but «قلب» does not find ❤️ in either, because the word a member
types is not in the index. This is an Arabic-first product; a search box that
only works in English is a search box that fails its main case. Their payloads
are also large for a composer that most conversations never open.

The field is also the one control in the product whose geometry is pinned to the
pixel: the row is 44px by arithmetic, and the paperclip and the end slot share
the field's centre (#1583). A new control has to fit that arithmetic rather than
re-derive it.

## Decision

**A curated catalog, in the repo, searched the way Arabic is typed.** Every entry
carries its own Arabic and English keywords (`frontend/ui/chats/emoji-catalog.ts`),
and the search normalises both sides before matching: diacritics removed, either
alef, either ya, a ta marbuta that answers a ha. «قهوه» finds ☕ and "coffee" finds
the same. The set is the emoji a conversation actually uses — a few hundred, not
every Unicode name — and it is one module behind `searchEmoji`, so a library that
eventually indexes Arabic can replace it without touching the field or the sheet.

**The sheet is a chunk of its own.** The field draws a 16px smiley and nothing
else loads; the panel arrives with the first press (prefetched on hover or focus)
and a failed fetch renders nothing rather than taking the route down, which is the
rule already written for every lazy boundary in
[docs/specs/offline-first.md](../specs/offline-first.md).

**The smiley sits inside the field at its start edge, and the paperclip keeps the
end edge.** In this RTL product that is the physical right for the smiley and the
physical left for the clip, which is the pair WhatsApp and Telegram trained
everyone to expect, and the field reserves the gutter (`pr-10`) so a long line
never runs under it. The row's 44px geometry and the end slot are untouched. The
comment field draws the same smiley and has no clip to place.

**A pick writes at the caret and the sheet stays open.** The command runs on the
editor's own selection, so the press that moved focus into the sheet did not move
the caret; three hearts are three taps, and a phone does not raise the alphabet
keyboard over the sheet it just opened.

**Recents are the device's.** The last sixteen glyphs live in `localStorage`, not
in the account: an emoji habit is not a profile fact, and a member who signs in on
another device has not lost anything worth syncing.

**The surface words the sheet, as it words the six marks.** The button's name,
the search, the empty answer, the recent tab and the nine category names come from
the surface's generated copy (`chat-thread.json`, `community-post.json`), so a
re-word is one JSON edit and `npm run copy:generate`, and the parity gate reads
the same keys the components render.

## Why not the alternatives

**A library with an English index.** It would be less code and more emoji, but it
would answer «قلب» with nothing, which is the one query this product must get
right. Its Arabic would be a translation of its interface, not of its index.

**A full Unicode set with generated Arabic names.** Unicode does not publish
Arabic names; the community translations are incomplete and uneven in register,
and a member would be reading a stranger's translation of a smiley. A curated
name is short enough to review.

**An emoji keyboard instead of a sheet.** The platform keyboard already has one on
a phone; the web composer cannot summon it from a desktop, and a control that is
only there on one device is the drift this repo keeps refusing.

**A toolbar row above the field.** It would leave the 44px row alone, but it
costs vertical space on the smallest screen for a control that is used
occasionally, and the field already has a selection bubble above it.

## Consequences

- **The catalog is not complete, and will age.** A missing glyph is a one-line
  addition, and the file says so; a Unicode release does not break the search.
- **No skin tones.** The default hand is the tone every platform draws. A
  per-member tone is a settings question with a stored preference, and this sheet
  does not own one yet.
- **The native rows do not have it yet.** `AssistantSheet.kt` and
  `CommentComposer.kt` draw their own input rows, and every port is switched off
  (`NATIVE_SURFACES_VISIBLE = false`), so the APK shows the document — these
  composers — on every route. Adding the sheet to a native row is a port, with
  the copy pair, the parity row and the visual evidence that a port owes.
- **The commands the sheet's index serves are the tests'.** The Arabic spelling
  rules are asserted (`frontend/ui/chats/__tests__/emoji-picker.test.tsx`), because
  a normaliser that quietly stops matching «قهوة» is not a visible failure.

## Amendment (2026-11-28): the sheet is a tray under the composer

The decision above says the panel is _the site's bottom sheet on a phone_, and
justifies it with "a phone does not raise the alphabet keyboard over the sheet it
just opened". Both halves are reversed.

**The sheet was the wrong surface.** Every popover below `lg` becomes a bottom
sheet (`frontend/ui/primitives/responsive-sheet.tsx`), so the picker covered the
composer: a member picking a glyph could not see the draft they were decorating,
and the scrim + focus handling of a modal surface sat between them and the row
they were writing in. Telegram and WhatsApp solved this the other way, and the
tray follows them.

**The tray is in the composer's flow, not over the thread.** Below `lg` the panel
is drawn as the row's second line: the composer stays visible, the thread shrinks
by exactly the height the on-screen keyboard would have taken, and no scrim,
portal, popper math or focus trap is involved. `--roy-keyboard-cover` and
`100dvh` already carry that arithmetic for the keyboard
(`frontend/ui/shared/keyboard-inset.ts`, `app/chats/[id]/page.tsx`), so the two
slots are the same slot. Above `lg` the wrapper is positioned over the message
list instead, because a docked tray there would cost the thread its room for a
control a desktop keyboard already has.

**The tray and the keyboard take turns.** Opening the tray leaves the editor, so
the alphabet keyboard goes down; the smiley becomes a keyboard switch whose press
closes the tray and puts the caret back, which raises the keyboard again. Tapping
the field is the same switch, so the field is a way back too. The search box does
not autofocus — that would raise the keyboard over the panel that was just opened
— but a member who taps it gets the keyboard with the tray shortened above it
rather than the composer pushed off screen.

**One dismissal rule for both presentations.** A press outside the tray closes
it, Escape closes it and returns the caret to the field, and the smiley itself is
exempt because it reports its own state: closing there and letting the press
through would close and reopen the tray on one tap. Escape is stopped inside the
tray so it does not reach the assistant panel's dialog behind it.

**The field still owns the caret, the tray owns the row.** `ChatField` keeps the
editor and exposes `insertEmoji`/`focus` through a handle
(`ChatFieldHandle`); `chat-composer.tsx` and `post-comment-field.tsx` draw the
tray beneath their own row with `EmojiTray`. A composer owns what sits under it,
and a field that rendered the panel itself would have put the send button beside
the tray instead of above it. The comment row scrolls with the page instead of a
fixed footer, so it brings itself to the foot of the screen when the tray opens.

**The picker is no longer a `PopoverContent`.** `EmojiPickerPanel` draws the
catalog and nothing about placement; the tray's wrapper carries the two
presentations in CSS (`lg:` variants), so there is one DOM path and one dismissal
path. It keeps its chunk, its Arabic search, its recents, its copy keys and its
"a pick writes at the caret" rule. One generated key is added for the switch,
`emojiKeyboard`, to both copy sources.

**What this costs.** On a phone the tray takes roughly the slot the keyboard had
(`min(18rem, 40dvh)`), so it is not a full emoji keyboard's worth of rows; the
grid scrolls, and the categories stay reachable. Safari does not shrink the
layout viewport for the keyboard, so the route that does not take
`--roy-keyboard-cover` off its height — a post's comment page, unlike the chat
thread — can have the lower part of the grid behind the keyboard while the
search box is focused. The Android shell, which is the shipped client, resizes
and is unaffected. The native rows still have no picker at all (see the
consequence above), so this amendment adds nothing to the port.
