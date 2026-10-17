# An update offer names a worker, and the gesture is bounded

ADR-0042's prompt renders from a boolean and its button posts `SKIP_WAITING` into whatever
`registration.waiting` holds at the moment of the tap. Measured on 2026-10-17 against a production
build, with the page instrumented: two things that boolean cannot express, both of which end the same
way on screen.

**The offer can belong to a worker that is already gone.** The waiting worker is probed, announced,
and — because the announcement is deduped by a boolean — never re-checked against the worker it
described. A newer install can supersede it between the probe and the tap. A tap then either finds
nothing waiting (the fallback reload: measured, a navigation 96 ms after the tap, before any
`controllerchange`) or posts to a worker the browser has already superseded — and the browser answers
a message to a worker that is no longer waiting by doing nothing at all. No event, no error, no swap.

**A gesture that lands nothing has no way back.** The button's label is component state that only the
document unloading clears (`frontend/ui/shared/update-prompt.tsx`), so «جاري التحديث...» is honest
only while something is happening. With the message dropped, it is instead a frozen screen: no
timeout, no retry, no re-probe. The only ways out are the two the user found — dismiss, or reload.

The same measurement shows the healthy path is not instant either: the swap itself takes a frame
(~20 ms), then the reload it triggers re-fetches the whole build, because `activate` has deleted the
previous build's caches (`public/sw.js`). With the link throttled to 700 kbps the old page painted
«جاري التحديث...» for **1.0 s**; on a phone that is the wait being complained about, and the label is
correct the whole time.

## Decision

The offer is tied to the **worker** that made it, not to a boolean. `waitingUpdate` returns the
waiting worker, `report` compares worker identity, and a build that is superseded or activated takes
its offer down with it rather than leaving a gesture that lands nowhere clickable.

The gesture is **bounded**. `applyWorkerUpdate` keeps the identity of the controller it posted from,
and a landed swap is exactly "the controller is not that worker any more". No change by
`UPDATE_APPLY_DEADLINE_MS` means the swap did not land, so the gesture ends in a reload — the one the
module already owed in two situations: a swap that landed while the document was hidden or frozen and
was never replaced, and a message that activated nothing. The fallback logs
`Service worker update gesture never landed`, which is the trace the stuck state never had.

**What the deadline does not do is install the update.** Only `SKIP_WAITING` can, and a reload does not
release a waiting worker — measured in the same e2e file, a reload keeps it waiting (ADR-0039). What
the fallback buys is that the state is never terminal: the label goes back to «تحديث الآن» with the
update still on offer, so the next tap names whatever worker is waiting then rather than the one the
stale offer was bound to. A cold start remains the release for a worker no message can move.

## Considered Options

- **Re-post `SKIP_WAITING` on the deadline, before giving up.** Rejected as the first move: the probe
  already read `registration.waiting` at the tap, so a second post names the same worker. The retry the
  user actually gets for free is the one after the reload, against whatever superseded it.
- **Ask the worker to confirm over a `MessageChannel`, and only reload when it stays silent.**
  Rejected: more machinery for an answer the controller already gives — a swap that happened is a
  controller that changed.
- **Keep the button spinning forever, but say more (a spinner, an elapsed count).** Rejected: it
  makes a dead end look busy. The point is that the document has somewhere to go.
- **Bounding the wait instead: shorten it by not purging the previous build's caches in `activate`.**
  Not rejected — deferred. It is a real fix for the 1.0 s, and it belongs to the cache lifetime
  (`public/sw.js`, ADR-0039's swap), not to this channel's failure handling.

## Consequences

The unit of change for the announcement is a worker, so a superseded offer is withdrawn and a
replacement is re-announced. The consumer still takes a boolean: `use-pwa.ts` ignores a value it
already holds, so a replacement offer does not re-render anything, it only re-establishes that an
update is (still) ready.

A gesture that would have hung now ends in a reload after at most five seconds, and says so in the
console. The wait itself — a cold re-fetch after the swap — is unchanged, and remains the thing to
look at if the complaint is about duration rather than about never finishing. The exact trigger for a
message that activates nothing is not yet reproduced on a device: what is reproduced is the stale
offer, and what is now guaranteed is that neither failure is silent.
