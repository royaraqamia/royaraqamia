# The assistant has a door on every screen

The assistant (ADR-0113) was reachable only from the Chats tab inside Notifications. It is the
product's most valuable way in — the one thing that can answer a question, read a member's own
data, or propose an action while they are looking at the page that raised it — and it was behind a
bell and a tab. This records the door that puts it on every screen, the name it now answers to, and
what the two clients share.

## Decision

1. **It has a name: نور.** «المساعد الذكي» is a description, not a brand; it is what a settings page
   calls a feature. نور is short, human, and it is the same idea the brand already carries — رؤية is
   sight, نور is light — and the mark the thread already drew is a lit orb. The name is one contract:
   `chatTitle()` names the thread, the system prompt introduces it, and the list row, the composer,
   the launcher and the panel all read it. No surface gets a second name for the same assistant.

2. **One door, mounted once.** `AssistantLauncher` is rendered by the root layout, not by each
   screen, because the control cannot depend on every future page remembering it. It sits in the
   inline-start corner (physical right on this RTL site) — opposite the page-level compose FABs, so
   a screen that already has a primary action does not grow a second one on top of it — and it rises
   with the other corner floats when the Recitation plays (ADR-0087).

3. **It is hidden where it has nothing to add.** `/chats...` is already the conversation; a floating
   composer over it is a second one for the same thread. `/auth...` is a flow whose job is to leave
   the page, so a member-only conversation there is a door into a wall. The same two prefixes are
   hidden on both clients.

4. **The panel is in place; the thread is created on open.** The web opens a dialog, the app opens a
   bottom sheet. Both call `POST /api/chats/assistant` on open — idempotent, one thread per member —
   so a visitor who never asks نور anything never gets a row, and a member who opens it twice gets
   one conversation. The panel shows the newest page of that thread and writes through the same
   endpoints the full screen uses.

5. **The states are the server's answers.** A guest sees the invitation and the sign-in call, never
   a composer that would refuse every question. A plan with no turn sees the upgrade; a deployment
   without a provider key says the assistant is unavailable; a spent day is the composer's own
   sentence. Both clients read the same words from `shared/copy/assistant-panel.json`, and both
   declare the same states (`AssistantUiState` on the app, the panel's state branches on the site),
   which is the parity row rather than a review promise.

6. **What the app does not do yet is filed, not hidden.** The native sheet streams answers, stages
   and uploads files, and opens the full conversation. A proposal is not confirmed there: the
   action contract is not generated for Kotlin, and the native chats port is still behind the
   visual gate. #1182 carries that work; #1184 carries images, playback and the microphone. The
   sheet's header link is the honest path until they land.

7. **The door is chrome, so it is measured as chrome.** It is not a routed surface; `check:visual`
   gates ports of routes, and this is a component every route wears. It gets a parity row
   (`assistant-launcher`, `assistant-panel`) and, in #1183, a place in `shared/visual/chrome.json`
   beside the top bar and the tab bar.

## Considered options

- **A hidden route (`/assistant`) that each screen links to.** Rejected: it leaves the page the
  member was reading, which is the opposite of what an assistant is for, and it gives the app a
  second route to keep in step with the site.
- **A centre orb above the tab bar.** Rejected: the bar has three destinations, and a fourth object
  in the middle competes with them and with every page's own FAB. The corner opposite the FABs is
  free by construction.
- **The bottom-start corner, stacked above the existing FABs.** Rejected: it needs an offset rule
  that knows which page has a FAB, and two FABs in one corner is two primary actions.
- **Web only.** Rejected: the app's frame draws native screens for a growing set of routes, and a
  product element this central would silently disappear on exactly the screens the app invested in.
- **Rename only the launcher and keep «المساعد الذكي» in the thread.** Rejected: a member would meet
  نور in the corner and a differently named assistant in the conversation it opens.

## Consequences

- The root layout gains one client component; the conversation chunk is loaded on first open
  (`tolerateChunkFailure`), so a reader who never asks downloads only the orb.
- The launcher is fixed and the page must keep its corner clear. It shares `--roy-corner-rest` and
  `--roy-float-rise`, so the tab bar and the Recitation move it without a second rule.
- The assistant's name and persona are now feminine and consistent: the prompt, the composer's
  "نور تكتب...", the locked and unavailable sentences, and the fallback errors all say نور.
- The web panel reuses the thread's own composer and message parts; a change to the assistant's
  composer changes both surfaces, which is the point.
- The remaining native parity is tracked by #1182 (proposals), #1183 (the door in the frame
  contract) and #1184 (images, playback, voice). The tracker issue is #1185.
