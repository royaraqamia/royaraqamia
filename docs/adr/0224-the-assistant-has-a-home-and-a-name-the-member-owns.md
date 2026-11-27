# 0224. The assistant has a home, and its name belongs to the member

## Status

Accepted (2026-11-27). Removes the two pieces of chrome the assistant panel grew
after [ADR-0143](./0143-the-assistant-has-a-door-on-every-screen.md), gives the
assistant one settings surface of its own, and makes the name and the mark a
member's own. Applies ADR-0150 (the panel paints its cache), ADR-0180 (trust is
per tool), ADR-0182 (memory) and ADR-0219 (code runs in a second plane). The work
order is [docs/specs/assistant-home.md](../specs/assistant-home.md).

## Context

The floating panel's header (`frontend/ui/assistant/assistant-panel.tsx`) carries
four different jobs in one 40px row: the orb, a pill linking to `/coding`, the
name «نور», and a line that says «متاحة الآن» when no turn is running.

**The line under the name is the phase slot, and it stays.** ADR-0172 decision 3
made the header the one place a turn's phase is drawn, with its height reserved,
and the idle sentence fills the same slot. What does not belong is the green dot
beside the orb: it is a member's last-seen badge (`ASSISTANT_ONLINE` in
`shared/copy/chat-thread.json`, ADR-0212) hung on a model, and it says the same
thing the text already says. The behaviour spec refuses the framing that badge
invites — «Not a avatar, not a friend»
([nour-behaviour-spec.md](../assistant/nour-behaviour-spec.md), §4) — so the text
stays and the badge goes.

**The coding pill duplicates a capability at the place the capability lives.**
The turn already starts and drives coding tasks: `start_coding_task`,
`coding_task_status`, `coding_task_diff`, `approve_coding_step` and
`reject_coding_step` are registry entries in
`backend/services/chat/chat-agent-tools.ts`, and ADR-0219 decision 1 makes the
chat service the control plane. A permanent link to `/coding` inside the
conversation tells the member that coding is a _different_ assistant, which is
the opposite of the truth and of what the large assistants do. The pill is also
web-only: `AssistantSheet.kt` never had one, so the site has been the odd client
out in a component ADR-0143 decision 7 declares chrome — chrome is not a route,
so `check:visual` and the parity gate never saw it.

**The grants block is settings wearing a conversation's clothes.** It is mounted
inside the connected-apps view (`mcp-connected-apps-view.tsx`, decision 4 of
ADR-0180 anticipated "the assistant settings" — no such surface exists), which is
about inbound MCP clients. Two trust models with different owners share one
stack: "an app may call me" and "my assistant may act without asking". The
grant's own copy admits the flow it wants — «جرّب أداة أولاً ثم امنحها» — which is
a moment in the conversation, not a row in account settings.

**One assistant has five doors and no home.** Memory is `/account/memory`, apps
are `/mcp/apps`, coding is `/coding`, the grants are inside connected apps, and
the conversation is in the corner. The name is a constant in
`shared/copy/assistant-panel.json` (`title: "نور"`) that every surface reads. A
member cannot change the one thing that is theirs to change, and has nowhere to
stand when they want to see what the assistant is and what it may do.

## Decision

1. **Identity is a private row, owned by the member.** A name, a mark and a tone
   live in `public.assistant_identities`, keyed by `(user_id, assistant_key)`
   with `assistant_key = 'default'` from the first release. One row now, the
   roster's shape from the start, so a second assistant is a row and not a
   migration. No row means the deployment default, «نور»; nothing is migrated and
   no existing member's view changes on the deploy.

2. **A member's copy is never visible to another member.** Owner-only RLS, no
   public read, and no route that resolves another account's assistant. Shared
   surfaces — a group thread, a handed-over task — say «المساعد» and draw the
   site's orb, never a member's name or mark. This is what makes the next
   decision possible, and it removes avatar impersonation, name moderation and
   "is this a person?" from the product surface entirely.

3. **The surface is `/assistant`, labelled «المساعد», and it is not a profile.**
   A user profile is a social object: it is visited, followed and owned by a
   handle. This is one member's settings, so it takes a neutral route that
   survives a rename: `/u/<name>` would put a private copy in the members'
   namespace and break the moment two members name their copy differently. The
   page's title is the member's chosen name; the navigation label stays generic.

4. **The panel header is the door.** The header keeps the mark, the name and one
   real state line, and the mark and name are the control that opens `/assistant`
   (dismissing the sheet first, because the panel is mounted at the root and
   would otherwise stay over the new page). The «المساعد المبرمج» pill and the
   green presence dot are deleted on both clients — the dot on every surface that
   draws the assistant (the panel header, the thread header, the chats row and
   the app's sheet), because it is one claim about one assistant. Discovery of
   coding moves to the first screen, where the registry already advertises a
   question per condition (`suggestedAskWhen`): a fourth condition offers the
   coding question to a member with a repository, which is data instead of
   chrome.

5. **The home is the index; the existing routes become its children.** Identity
   and permissions are drawn on the page itself; memory, apps and coding are
   sections that link to `/account/memory`, `/mcp/apps` and `/coding`. Nothing is
   duplicated, and no route moves in this decision — the account keeps exactly
   one row, «المساعد», in place of the memory row, because one door is the point.

6. **Trust is granted in the conversation and revoked at home.** The grants list
   leaves `/account/connected-apps` and the account page and is drawn by the
   home. The in-chat approval gains the "always allow" the copy already promises
   (ADR-0180 decision 2), which is the only moment a grant can be created; the
   home is where a member reads and revokes what exists, with the audit trail
   ADR-0180 requires.

7. **v1 customization is closed by construction.** Name, one of twelve
   deterministic orb variants, one of four tone presets, and one optional
   single-line note (120 characters) that the prompt block receives as quoted
   data, never as instructions. No free-text personality, no model picker, no
   avatar upload, no voice. A preset is a value the prompt builder maps, so it can
   be evaluated; a textarea is a second, unmeasured prompt.

8. **A custom name must not gender the copy.** The assistant speaks in the first
   person, where Arabic does not mark gender, and the third-person sentence that
   agrees with the name is rewritten to be neutral: «جاري الكتابة...» instead of
   «نور تكتب...». The copy that names it gains a `{name}` placeholder
   (`title`, `intro`, `placeholder` and the two guest lines in
   `shared/copy/assistant-panel.json`), because a sentence that hard-codes «نور»
   would be wrong the moment a member renames their copy. The name itself is 1-24
   letters (Arabic or Latin), ASCII digits and single spaces, no punctuation, no
   newlines, and the site's own names are reserved. The system prompt receives it
   inside a quoted identity sentence, and an eval case proves an
   instruction-shaped name changes no behaviour.

9. **The identity is paired and cached like the rest of the panel.** One copy
   file (`shared/copy/assistant-home.json`), one generated Kotlin object, one
   parity row. The name and variant are written into the panel's snapshot
   (ADR-0150) so a rename paints on the next open with no round trip, and the
   app's sheet reads the same row from the same route.

## Why not the alternatives

- **A public assistant profile at `/u/nour`.** Rejected: decision 2 makes the
  identity private, so the page has a different owner at the same address per
  viewer; and `/u/` is the members' namespace, where an assistant would read as
  a person and invite follow, report and impersonation semantics nobody asked
  for.
- **Keep the coding pill and only restyle it.** Rejected: the pill is a second
  product's brand inside the first one's conversation, and the capability is
  already there as a tool. Restyling it keeps the claim that coding is elsewhere.
- **A "programmer assistant" as a second agent.** Rejected: it splits memory,
  grants and history per agent before a roster exists, and it teaches the member
  that the assistant is several products.
- **Move the grants into account settings but keep them on the page.** Rejected:
  the account page is the member's own record; the assistant's permissions are
  the assistant's. ADR-0143 already argues the same way about doors.
- **Let the member type a personality.** Rejected for v1: unbounded text in the
  prompt cannot be evaluated, cannot be rolled back per value, and turns a
  settings field into a second prompt surface with no gate.
- **Let the member upload an avatar.** Rejected: it imports the member avatar
  pipeline plus image moderation and a real-person impersonation policy into a
  surface whose whole safety argument is that the mark cannot impersonate.
- **Name it in the URL (`/assistant/nour`) and redirect on rename.** Rejected: a
  redirect table for a string that lives in one row, and a broken link every time
  someone changes their mind.

## Amendment (2026-11-27)

Decision 9 assumed the page would be a pair. `/assistant` is a **document
surface** — `docs/mobile/screens.json` says `native: null` — so its words live
beside the view in `frontend/ui/assistant/assistant-home-copy.ts`, with no
generated Kotlin object and no parity row; a copy source no native component
draws is exactly what `check:parity` refuses. A `shared/copy` source arrives
with the first native copy of the page, if one is ever drawn. The app's door is
the sheet's header, which is a link, not a form.

The first slice also left three things that were listed as phase 1: the sheet's
header link on Android, the account row that becomes «المساعد», and the
in-chat «اسمح دائماً». Each needs a Kotlin change and ships with its pair.

## Consequences

- A migration, a table with owner-only RLS, and a foreign key to `auth.users`
  with a cascade on delete. No backfill, no change for a member who never opens
  the page.
- The panel header loses a link and a dot on the web; the app's sheet loses the
  dot it never had a use for, and gains the door. `AssistantOrb` gains a
  `variant` prop; `AssistantMark` in the thread and the list read the same
  variant, or the member's chosen mark would not be the one they meet in
  the chat.
- The page's words live beside its view (`assistant-home-copy.ts`) until a
  native copy of the page exists, which is when they move to `shared/copy` (see
  the amendment). The panel's `title` becomes the fallback the identity
  replaces, not the only name.
- `perf/surfaces.json` gains `assistant`, `docs/mobile/screens.json` gains its
  document row and `docs/mobile/parity-plan.json` gains its row in the same pull
  request that adds the route — the three of them together, or `check:screens` and
  `check:plan` fail.
- `docs/assistant/capabilities.md` is regenerated: a `suggestedAskWhen` condition
  is a registry field, and the report is never hand-edited.
- The tone presets are prompt content: each one gets an eval slice, and a prompt
  change still has to clear the three-run gate in the behaviour spec.
- The account page keeps one row instead of three doors; `ACCOUNT_ROWS_COPY`
  gains the label and loses `memory` once the home links it.
- The Android release note is required: the sheet's header changes and the app
  reaches the new page.
- No public URL, so nothing new enters the sitemap, the feed or the profile
  page's contract.
