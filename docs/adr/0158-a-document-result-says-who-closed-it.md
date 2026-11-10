# A document result says who closed the document

[ADR-0117](0117-the-document-is-the-app-until-a-port-is-the-same-screen.md) made the document every
destination and recorded the exit as one bullet: "the document is launched for result, so the press
that finishes it at the site's root finishes the launcher too (ADR-0082) instead of revealing a frame
with nothing in it." `ShellActivity` therefore finished on _any_ result:

```kotlin
registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { finish() }
```

A result is not a statement about the user. The document is `singleTop` inside the shell's
`singleTask` task, so three other things end it, and the system reports all three as
`RESULT_CANCELED`: a deep link arriving while a page is open rebases the task and clears the document;
`bringFrameForward` (`CLEAR_TOP|SINGLE_TOP`, how the update card and a page's `426` draw over the
document) finishes it; and a process death inside the request followed by a relaunch that restores the
task destroys it. In each of those the shell finished itself too, so the app closed from a screen the
user never left. Measured on `Roy_API_35` with #1245's debug APK, twice in one session:

```
wm_finish_activity: [0,47350351,57,com.royaraqamia.app/.MainActivity,clear-task-stack]
wm_new_intent:      [0,120481959,57,com.royaraqamia.app/.shell.ShellActivity,android.intent.action.VIEW,...,268435456]
wm_finish_activity: [0,120481959,57,com.royaraqamia.app/.shell.ShellActivity,app-request]
wm_on_activity_result_called: [120481959,com.royaraqamia.app.shell.ShellActivity,ACTIVITY_RESULT]
wm_task_removed:    [57,57,0,removeChild, last child = .../.shell.ShellActivity]
```

A deep link while the document was open landed on the launcher. The frame's apps picker (#1194) was
unreachable on a device for the same reason, which is why `home` is still `todo`, and the update card
that arrived after launch closed the app instead of drawing over the document.

## The decision

**The result carries a decision, not a fact.** `DocumentExit.LEAVES_THE_APP` is a code only this app
produces (`RESULT_FIRST_USER`, not `RESULT_OK`), sent by the one back path that genuinely leaves —
`MainActivity.installBackExit`'s dead end — and the shell finishes on that value alone:

- **The root back still leaves (ADR-0082).** The document's own press at the site's root sets the
  result and finishes; the shell follows it. Nothing about the existing exit changes.
- **Every other result leaves the frame in front.** A rebase, a `CLEAR_TOP` and a restored task all
  deliver `RESULT_CANCELED`, and the shell stays where it is: the frame, which is what the deep link's
  `onNewIntent` then hands the new route from, and what the update card is drawn on.
- **One definition, both sides.** The code lives in `shell/DocumentExit.kt` beside the comparison, so
  the sender and the reader cannot drift, and `DocumentExitTest` covers the four results above.
- **The frame survives, so its screens are reachable.** A page's return no longer destroys the frame,
  which is the reachability `home` was waiting on. Switching `home` on is still its own visual gate
  (ADR-0118), not this change.

## Why not the alternatives

- **The shell's own back handler owns the exit.** `ShellBackStack` already knows the rule, and it is
  the shape the shell would have if the document were not an activity. It cannot answer this press:
  while the document is on top the press goes to `MainActivity`'s callback (ADR-0082), and the shell
  never sees it. The shell would have to be told the document's back reached the root — which is the
  result, one channel later.
- **An intent extra on the document's finish.** The same information through a second channel: an extra
  survives `onNewIntent` and can be stale, while the result is scoped to the request that produced it.
- **A shell-side flag set before every non-back finish.** Every caller that destroys the document —
  the system's rebase, `CLEAR_TOP`, the platform restoring a task — would have to set it, and none of
  them is ours to change.
- **Do not launch the document for result at all.** Then nothing hears the root back, and ADR-0082's
  exit becomes the frame's to guess: the shell would have to infer from `onResume` that the document
  left, which cannot tell the root back from a rebase either.

## What this costs

- **A frame with no document can be in front.** After a rebase or a card the shell is the visible
  screen for as long as the hand-over or the card takes. That is the frame doing its job — the launch
  screen, the card and the hand-off (ADR-0117) — rather than a blank activity.
- **The decision is a number, so it is tested as one.** `DocumentExitTest` is a JVM test; the rebase,
  the card and the restored task are still the platform's behaviour, and `docs/mobile/android-shell.md`
  keeps the three `adb` commands that check them on a device.
- **A shell installed before this keeps the old behaviour** until the update card installs the newer
  APK (ADR-0043). The web half needs nothing: a document load takes whatever build is waiting.
