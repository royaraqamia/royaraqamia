# Notifications are a page with two tabs, not a panel

The bell opened a dialogue: a 380px portaled popover on a wide screen that the phone turned into a
bottom sheet, with its own roving-tabindex menu, focus hand-off, outside-press dismissal and a scroll
area sized to the panel. It held twenty rows and one footer, and it was the only way to reach any of
them.

That shape had run out of room. The feed already mixes kinds a reader treats differently — a
certificate, a booking, a system announcement — and the planned conversation surface had nowhere to
go. A panel that must be dismissed to act, that cannot be linked to, that a browser Back cannot leave,
and that hides its own scroll behind a popover is a menu doing a page's job.

So `/notifications` is a page at every width, with two tabs: **المحادثات** and **التنبيهات**. The bell
is a link.

## The decision

- **One route, the tab in the query string** (`/notifications?tab=alerts`). A composed URL opens the
  same view, and a signed-out visitor returns to it after signing in. Switching tabs **replaces** the
  history entry rather than pushing one, so Back leaves the page instead of walking the tabs.
- **No tab in the URL means the newest unread row decides.** The feed arrives newest first, so the
  first unread row names its tab; with nothing unread the page opens on Chats. A URL that names a tab
  always wins.
- **Alerts holds every type the product writes**, and Chats has no rows yet: no table stores a
  conversation, so the tab is an honest empty state. The split is one function (`tabOf`) so the day
  Chats gets a source, only that answers differently.
- **Per-tab counts come from the server's unread count, not from the rows on screen.** The feed is the
  newest twenty, so a badge counted from it would shrink for reasons the reader cannot see and would
  disagree with the bell. A tab with nothing unread shows no badge.
- **A row opens what it is about.** The destination is derived from the type and the identifiers the
  producer stored (`slug`, `certificateCode`), in one table
  (`frontend/ui/notifications/notification-target.ts`), never re-derived per call site. A type with
  neither (a system announcement) renders as a row that only marks itself read. Opening an unread row
  marks it read first.
- **The row's delete button is a sibling of the link, not a child.** A button inside an anchor is
  invalid, and the delete has to stay reachable without opening the row.
- **The page is open to guests**, like the bell was: the panel is a sign-in prompt, not a redirect.
- **The document is not precached** (`DYNAMIC_BY_DESIGN`). Its feed is a client read, so a precached
  shell would paint an empty frame with the radio off, and the slot it costs evicts `/verify` — the
  link printed on physical certificates. The worker still caches the document at runtime
  (stale-while-revalidate), so a second open is served locally.
- **The push toggle stays on the page, below both tabs**, because it decides whether the device alerts
  at all, whichever list is open.

## Considered options

- **Keep the panel on desktop, a page on mobile.** Two surfaces, two keyboard contracts, two places to
  fix the next bug. The panel's only desktop advantage is a peek that does not lose the page — and the
  bell now links, so Back restores the page exactly.
- **Two routes** (`/notifications/alerts`, `/notifications/chats`). Costs a layout and a navigation for
  a tab, and Back then walks tabs, which is the behaviour the replace rule exists to avoid.
- **Tab as local state only.** Simplest, but nothing can be linked to, no tab survives a reload, and a
  guest's return from sign-in lands on the default.
- **Split existing types between the two tabs.** Invented a conversation that does not exist: a
  click on a tracked link is not a conversation, and a reader looking for either would find it in the
  wrong list.
- **A cached snapshot of the last-seen feed.** Notifications are per-identity rows that are read and
  deleted; a snapshot would show a count the server has already moved past, and the offline promise
  for this surface is the needs-connection state, not a stale list.
- **Cache the Chats tab's absence.** Hiding the tab until messaging ships would make the second tab
  appear one day with no way for a reader to know what it is.

## Consequences

- **`NotificationDropdown` is gone**, and so is `use-portal-popover`, which existed for it. The shell's
  notification control is a link whose only state is the count.
- **The panel's keyboard contract is gone with it** — no arrow keys, no focus trap, no outside-press
  rule. Tabs follow the WAI-ARIA pattern (arrow keys move selection, `Home`/`End` jump), and the rows
  are ordinary links and buttons.
- **The surface matrix gains a row** (`notifications`: server-owned, needs-connection, `shell: swr`,
  `bundle: remote`) and the screen inventory gains its web-only row, both checked by
  `check:surfaces`/`check:screens`.
- **`e2e/notifications-page.spec.ts` pins the move**: the bell is a link, the page offers both tabs, a
  guest gets the prompt, `?tab=` survives a reload, and a 320px phone gets a page rather than a sheet.
- **Chats will need a decision of its own** when conversations exist: where they live, who may start
  one, and whether the tab's count joins the bell's. Nothing here prejudges it beyond the seam.
