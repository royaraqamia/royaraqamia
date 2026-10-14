# A waiting build is announced, not just swapped in

ADR-0039 decided that a swapped worker replaces the document, and it rejected an "update available"
prompt. The swap half holds up; the rejection does not survive the measurement that came with it.

What the measurement showed is that the silent path has a blind spot exactly where it matters. A swap
waits for the previous worker's clients to go away, so a client that is never relaunched — a tab left
open all day, and above all the Android shell, which has no refresh control at all — sits on the build
it launched with. Nothing tells it otherwise. The honesty of the channel is that a _waiting_ worker
already means the new build is downloaded, verified and ready: announcing it is not a promise about a
download, it is the state the browser computed, and taking it costs one reload that works offline.

So the page now says so. `frontend/shared/sw-update.ts` reports the waiting state to `use-pwa.ts`, and
`frontend/ui/shared/update-prompt.tsx` renders a small line above the offline indicator: **«تحديث الآن»**
to take the build, **«لاحقًا»** to decline it. Declining changes nothing that happened before — the
ADR-0039 swap still replaces the document whenever the worker does change hands, and the next launch
still applies the build silently. Prompts are for the client that never relaunches; they are not a new
gate in front of the old path.

The two halves are deliberately different in kind. The swap reload is automatic because by then it is
too late to be graceful: `activate` has deleted the previous build's caches, so the document is
referencing chunks whose cache entries are gone. The prompt is for the window before that, where the
only cost of waiting is being one build behind, and where interrupting someone mid-form is not
obviously better than letting them finish.

## Considered Options

- **Nothing, as ADR-0039 decided.** Rejected: it is a bet that the user relaunches, and the users who
  most need the update are the ones who least reliably do. A prompt that is dismissed leaves exactly
  the old behaviour, so the option it replaces is still the floor.
- **Reloading automatically as soon as a worker is waiting.** Rejected: that changes the build under an
  in-flight form and mid-typing. The Outbox makes it survivable (ADR-0029), not welcome. Asking costs
  one gesture and keeps the timing with the person who knows whether they are in the middle of
  something.
- **`skipWaiting` in the worker's `install` (ADR-0030).** Rejected, unchanged. The button sends
  `SKIP_WAITING` _after_ the user asked for it, which is the distinction that ADR-0030 drew: the swap
  is not destructive when the document that blocked it has chosen to be replaced.
- **A modal or a mandatory update.** Rejected: there is no notion of a minimum supported build in this
  repo, and blocking a page that works for a build the user does not need is a worse failure than being
  one launch behind. If that changes — an APK the server stops supporting — it belongs in the shell's
  own prompt, where it can be mandatory for a real reason.
- **A version probe against `/api/version` (the half deleted with the old prompt).** Rejected: it polls
  to learn what the browser already knows. `registration.waiting` _is_ the answer, so the announcement
  costs no request, works offline, and cannot disagree with what the swap will do.
- **A badge, or a permanent "update ready" line.** Rejected: it cannot be declined, so it becomes
  furniture nobody reads, which is how the old prompt's flags ended up read by no component.

## Consequences

`sw-update.ts` now has two jobs and says so: report `updateAvailable` while a build waits, and replace
the document when a swap lands. Both were already watching the same events, so the report costs no new
polling — only the install's own `statechange`.

Dismissal is per document. A user who declines sees the prompt again after a refresh or the next
launch if the update is still waiting; that is activity-driven, not a timer, and it is the point —
a relaunch is exactly the moment the offer is cheap to accept.

At most one prompt exists in the Android shell. `frontend/shared/shell-update.ts` reads
`window.__royaraqamiaShell.updatePending`, which `MainActivity` sets before the page loads, and the
in-page prompt stands down while the shell has an APK update pending: installing that APK brings the
web build with it, so asking for a reload as well would be two prompts for one update. The contract is
written down in [docs/mobile/android-shell.md](../mobile/android-shell.md).

Detection still depends on `CACHE_VERSION` changing per deployment, exactly as ADR-0039 records: the
prompt and the swap are both downstream of a new worker installing. If that key ever becomes a content
hash of the worker's own bytes, the announcement goes quiet along with the swap — and a version probe
becomes worth revisiting, now that there is a surface to render it on.

`e2e/sw-update.spec.ts` pins the announcement: nothing is offered while the document is current, a
waiting worker is announced, declining leaves the document and the offer alone, and after a refresh the
gesture is what moves the document — once, with no loop. The one case where the page holds its offer
back — the shell announcing its own update natively (ADR-0043) — has its case there too: a shell user
agent and a routed manifest, with a waiting worker behind it and a prompt that stays down.
