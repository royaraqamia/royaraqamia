# A waiting build is taken on load, silently

ADR-0042 announced a waiting build in a page-rendered pill: **«تحديث الآن»** to take it, **«لاحقًا»**
to decline. It refused to reload without a gesture, on the grounds that a reload costs whoever is
mid-form, and the gesture keeps the timing with the person who knows whether they are in the middle of
something.

That reasoning holds for a document someone is _using_. It does not hold for the prompt itself, which
turned out to be the wrong shape for the two things it sat between:

- It asked a question whose only real answer is "yes", because the alternative is a document that
  stays on a build nobody supports.
- It persisted regardless: dismissal was per document, so a visitor who declined saw it again on the
  next refresh, and the pill became furniture — the exact failure ADR-0042 predicted for a permanent
  line.

So the prompt is removed. What replaces it is smaller and has no state on screen: **a document load
takes the waiting build, and nothing else does.**

## Decision

`takeWaitingUpdateAtLoad` (`frontend/shared/sw-update.ts`) runs once per document, at load:

1. Only a document that a worker already controls is eligible — a first install is not an update.
2. It asks the browser for a deploy (`registration.update()`). This is the load's own check, and it is
   what makes the promise true: the deploy that landed since this document was cached is normally
   still _installing_ when the load starts, because the browser's navigation-time check finishes too
   late for this document to see its result.
3. It waits for that install to reach `installed` (`UPDATE_TAKE_INSTALL_DEADLINE_MS`, 20 s). Past the
   deadline the document stays where it is and the next load tries again.
4. With a worker genuinely waiting, it posts `SKIP_WAITING` and lets the swap reload the document
   (`applyWorkerUpdate`, the same bounded path ADR-0055 built for the button).
5. It refuses while the shell is announcing its own APK update (ADR-0043), for the reason recorded
   there: one update at a time, and the APK install brings a newer web build with it.

A document that is merely _open_ is never moved. The `focus` and 15-minute re-checks that fed the pill
are gone, so a live document costs no requests and never reloads on its own. The one reload the page
does not choose is preserved: when another client takes the deploy first, `activate` has already
deleted this build's caches, and the document reloads once when it becomes visible (ADR-0039).

Durations are in `sw-update.ts`; the loop guard is `UPDATE_TAKE_GUARD_MS` (60 s, per tab), which is
what makes the take safe when the message lands nowhere: the reload that the deadline owes comes back
with the worker still waiting, and that document must not try again immediately.

## Consequences

**A refresh is two loads, not one.** The page the user gets comes from the previous build's cache — a
reload does not release a waiting worker (measured 2026-10-14, `e2e/sw-update.spec.ts`) — so the only
way onto the new build is to give it control and load again. The second load is local: the waiting
worker has already precached its build, so what is paid is one HTML round trip, tens of milliseconds
on the same origin. This is the trade the prompt was avoiding, and it is worth stating plainly: a
flicker after a deploy, in exchange for no question and no stale document.

Cold starts are unaffected and stay the fastest path: with no clients left, the waiting worker
activates before the next document is served, so the launch is one load on the new build.

**A client-side navigation is not a load.** Next.js route changes keep the document, so tapping a tab
or a link inside the app stays on the build the document was served. Only a real document load —
refresh, external entry, app relaunch — takes the update. Dirty-checking every route transition for a
waiting worker would put a reload under someone in the middle of reading, which is precisely what this
decision refuses.

**A new deploy is noticed no earlier than the next load.** That is the cost of dropping the re-check;
in exchange, an open document makes no `getRegistration()` call, no worker-script request and no
manifest request beyond the one the shell channel already makes.

## Considered Options

- **Keep the prompt (ADR-0042).** Rejected on the two failures above: a question with one useful answer,
  asked again on every load after a dismissal, in a pill that a phone has to keep clear of the corner
  floats. ADR-0042's own measure of a good prompt — that it not become furniture — is what it became.
- **Take the build the moment it is installed (`skipWaiting` in `install`, ADR-0030).** Rejected,
  unchanged: it swaps the build under a live document mid-form, and `activate` purges the chunks that
  document is rendering from. Taking at load is the same mechanism with the timing chosen by a moment
  that already reloads everything.
- **Reload as soon as a waiting worker appears, while the document is open.** Rejected in ADR-0042 and
  again here: that is an unrequested reload at a time decided by a deploy, not by the person.
- **Serve navigations network-first so a refresh is always the newest build in one load.** Rejected:
  it makes the first load of an offline cold start a blank page. The site is offline-first by design
  (ADR-0039, `public/sw.js`), and the extra load is cheaper than that failure.
- **Take `SKIP_WAITING` during `pagehide`, so the reload lands on the new build by luck.** Rejected:
  whether it wins the race against the navigation is unknowable from the page, so the behaviour would
  be one load some of the time and two the rest, with no way to pin either in a test.
- **A badge, a countdown, or a "restart to update" line.** Rejected for the reason ADR-0042 gave and
  this decision confirms: the surface is the problem, not its wording.

## Verification

`e2e/sw-update.spec.ts` pins the new contract: a refresh takes the deploy once and lands the new build;
an open document is never moved, focus event included; a document whose build another client replaced
reloads on visibility; a take whose message lands nowhere still moves the document and does not loop;
and the shell's own update card keeps the page on its build. The unit tests in
`frontend/shared/__tests__/sw-update.test.ts` pin the refusals — first install, hidden document, user
input, shell suppression, guard window — and that the watcher installs no timer.

> **Amended 2026-11-12 - see ADR-0171.** The reload in step 4 is now the take's own, because the swap
> no longer reloads at all: the worker records the build each client was served and keeps that build's
> chunks while the client is alive. The take also no longer refuses a load that was ever touched - it
> waits out `UPDATE_IDLE_WINDOW_MS` instead - and a load in a background tab retries when the tab
> becomes visible. The paragraph above about `activate` deleting this build's caches is superseded by
> #488 and ADR-0171; the only reload that remains is a chunk that genuinely 404s.
