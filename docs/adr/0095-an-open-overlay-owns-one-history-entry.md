# An open overlay owns one history entry, so Back closes it

The Android back press is answered natively: `MainActivity.installBackExit()` walks the WebView's
history (`canGoBack()` then `goBack()`) and finishes the task at the root, because a page listener
would depend on the Capacitor bridge being injected ([ADR-0082](0082-the-system-back-button-closes-the-app-at-the-root.md)).
A dialogue is component state, not a history entry, so that walk stepped over it: on an opened
dialogue, Back took the user back a page and kept the dialogue behind, when the press should have
closed the dialogue and left the page exactly where it was.

The overlay now puts the entry there itself. Opening a `Dialog` or a `Sheet` pushes one same-URL
entry tagged with a depth marker; `popstate` closes the overlay opened last; closing the overlay any
other way takes the entry back off. The URL never changes, so the page underneath is never
navigated, re-rendered or scrolled.

The wiring is in the primitives (`frontend/ui/primitives/overlay-back.ts`, called from the `Dialog`
and `Sheet` roots), not in the screens. Every overlay in the product is built from those two roots,
and a per-screen fix would have to be repeated for each one — and forgotten by the next one.

## The decision

One entry holds any number of open overlays, with the depth in the entry's state — not one entry per
overlay.

- **Overlays nest.** A discard confirm opens over the editor that asked for it, and the editor can
  close as the confirm opens. One entry per overlay strands whatever the top of the stack can no
  longer reach, and a stranded entry spends a press on nothing.
- **Each press still closes exactly one overlay** — the one opened last — and re-arms the entry while
  any remain. So the arithmetic the user does ("Back, Back, Back") matches the overlays they see.
- **A close that is deferred keeps the press.** A controlled dialogue that asks before discarding
  stays open; the entry is re-armed from what is actually still open, so the next press reaches the
  overlay again instead of the page behind it.
- **Back is the close button.** The press calls the same `onOpenChange(false)` path as the close
  button, the scrim and Escape, so wherever a screen guards its close (the note composer while it is
  landing a write), Back is guarded the same way. Nothing invents a second close path.
- **Radix's uncontrolled roots are made controlled.** Radix keeps an uncontrolled root's open state
  to itself and only reports it, leaving nothing to call when the press has to close it; the hook
  owns that state and keeps the caller's `open`/`defaultOpen`/`onOpenChange` contract.

The entry is Next.js-shaped: `history.state` is spread, so the router's `__NA` marker and internals
tree travel with it. Next's patched `pushState` passes a marked state straight through instead of
treating it as an external navigation, and the traversal back to the previous entry is an ordinary
restore of a URL that did not change. Without the marker Next would read a pop onto an entry it does
not recognize as a reload (`handlePopState` in `next/dist/client/components/app-router.js`).

## Considered options

- **Native asks the page before walking.** `MainActivity` would emit the Capacitor `backButton` event
  and wait for an answer. Rejected: it is the channel ADR-0082 gave up on, because a press that
  depends on the bridge does nothing on a launch where the bridge failed to inject. It also needs the
  native side to know whether the answer arrived.
- **A `backButton` listener in the page, with `App.exitApp()` at the root.** Rejected in ADR-0082 for
  the same reason, and it would not help mobile web, where the same defect exists and there is no
  plugin at all.
- **One history entry per overlay.** Rejected above: nested and out-of-order closes strand entries.
- **Close the overlay and call `history.back()` regardless of what is on top.** Rejected: the traversal
  is asynchronous, and a swap (an editor closing as its confirm opens) pushes the next entry before it
  runs — the traversal then pops the entry that was just pushed, and the confirm never gets one.
- **Escape/outside-tap only, no history entry.** This is what the code did; it is the defect.

## Consequences

- **The history gains and loses an entry per overlay**, and Back never leaves the page while anything
  is open. At the root of a cold launch the second press still ends the task (ADR-0082), because the
  guard entry is gone by then.
- **A URL that carries state is unaffected.** The guard never writes a URL, so a dialogue that is not
  in the URL stays out of it; the notes surface's `?note=` (written with `replaceState`) is untouched.
- **The page's `hasInAppNavigation()` counter is untouched** — this is a `pushState`, not a router
  navigation, so the in-app back control still goes _up_ on a cold open rather than back.
- **Chrome and the shell agree.** The gesture and the hardware press are the same traversal, so one
  spec (`e2e/responsive-overlay-back.spec.ts`) covers both at the four mobile widths, and the unit
  cases pin the entry arithmetic in `frontend/ui/primitives/__tests__/overlay-back.test.tsx`.
- **Picker sheets claim the press too.** `Sheet` backs the navbar services menu and the mobile pickers;
  a press closes them instead of leaving the page. Popovers, dropdown menus and selects are Radix
  popper panels and are untouched — they close on Escape and outside tap, and are not what Back is for.
