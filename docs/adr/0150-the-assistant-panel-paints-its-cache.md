# The assistant panel paints its cache while it revalidates

The floating assistant (ADR-0143) was opened like a page instead of a conversation: every tap on
the door threw the panel away, so the thread, the draft and the scroll position went with it, and
the next open asked the server for the same page it had just shown. Two of its controls — «ترقية
الخطة» and «فتح المحادثة كاملة» — also did nothing at all, because closing the dialog and
navigating are two writes to the history in one gesture and the close cancelled the push
(`frontend/ui/primitives/overlay-back.ts`). The same reopen loss existed in the app's native sheet.

## Decision

1. **The panel outlives its close.** `AssistantLauncher` keeps `AssistantPanel` mounted after the
   first open and passes `open` down; the dialog still unmounts its content, but the conversation,
   the composer's draft and the scroll position stay in the component. A reopen is a repaint, not a
   round trip.

2. **A cold start paints the device first.** The thread is already in the identity's Local Store
   (the full thread screen writes it there), so the panel reads the header and the newest page from
   `ChatsLocalStore` and revalidates behind them. A small `localStorage` snapshot, partitioned by
   identity, remembers which thread the member owns and the last face the server answered — so a
   Free member sees the upgrade immediately instead of a composer that would refuse the turn a
   moment later. Neither is an authorization: RLS still decides what a read returns, and a
   sign-out clears the namespace with the rest of it.

3. **The native sheet keeps the same page.** `AssistantSheet`'s state used to live only in its
   composition. The shell now holds an `AssistantSnapshot` and the sheet seeds from it, paints,
   then revalidates. With no snapshot (a process that was killed) the sheet looks for the assistant
   row in the chats Local Store and paints the header and newest page from there before the
   network.

4. **A link that dismisses an overlay navigates through `DismissThenNavigateLink`.** This is the
   shape the repository already has for the same gesture; the panel's two links now use it. The
   sign-in CTA already did.

5. **A streaming answer only moves a reader who is at the bottom.** The web scrolls the panel's own
   element once per animation frame instead of `scrollIntoView` on every token (which also scrolled
   the page behind the dialog); the sheet scrolls directly rather than restarting an
   `animateScrollToItem` per token. Neither happens after the reader has scrolled back into the
   conversation.

6. **The orb's motion belongs to the door, not to every answer.** Message bubbles draw the still
   `AssistantMark`; the animated, blurred halo is drawn by the launcher, the header and the empty
   states only. Its orbit is composited on its own layer.

## Considered options

- **Persist the panel in a global store instead of keeping it mounted.** Rejected for the same
  reason the launcher already keeps the loaded chunk: the component is the smallest cache, and a
  second store would have to reproduce its draft, scroll and streaming state.
- **Add a second IndexedDB for the panel.** Rejected. The chats Local Store already holds the
  thread's header and newest page, with the same window, retention and identity partition the full
  thread uses; a second copy is the drift ADR-0103 exists to prevent.
- **Always scroll to the newest line.** Rejected: a member reading an earlier answer during a long
  stream loses their place on every token.
- **Prefetch the panel chunk on every page load.** Rejected: ADR-0143 keeps the conversation out of
  the shell on purpose, and blanket idle prefetch would charge every visitor for a door they may
  never open. Hover, focus and a pointer down start it; idle starts it only for a browser that has
  opened the panel before.

## Consequences

- `frontend/api/chats/assistant-cache.ts` is the panel's one door to the cache; a cache miss or a
  refused IndexedDB is a slower open, never an error.
- The panel's first open after a reload can show a page a few seconds stale; the background read
  replaces it, and a failed read leaves the cached page instead of a failure screen.
- The app clears its snapshot on sign-out, and the web's snapshot is partitioned by identity, so a
  member never sees the previous account's conversation.
- The messages' `aria-live` region and the panel's scroll container are the web's own; the sheet
  keeps the same reading rule without a DOM.
