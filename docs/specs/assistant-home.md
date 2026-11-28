# The assistant has a home — plan

The assistant already answers, reads the member's own rows, searches, proposes
writes and runs coding tasks. What it does not have is a place that says who it
is, what it may do, and what it remembers. This plan gives it one, moves the two
pieces of chrome its panel grew, and makes the name and the mark the member's
own.

The decision is [ADR-0224](../adr/0224-the-assistant-has-a-home-and-a-name-the-member-owns.md).
This file is the work order: what exists, what changes, in which order, and the
evidence that says a phase is done.

## Status

Landed (2026-11-27, #1935): phase 0 in full, and phase 1 except the three
changes that need a Kotlin pair — the sheet's header link, the account row, and
the in-chat «اسمح دائماً». The grants list moved to the page with them (phase 2's
UI half). The identity is now edited from the header, with an uploaded face and a
chosen voice, per [ADR-0228](../adr/0228-the-assistants-face-and-voice-belong-to-the-member.md)
(2026-11-28); the name, face and voice reach the rest of the site in the next
slice. Still open: the tone picker, the note and the prompt block (phase 3), the
Android half of the door.

## What already exists

| Piece                | Where                                                                                                      | Reused how                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| The panel header     | `frontend/ui/assistant/assistant-panel.tsx`                                                                | Loses two elements; the mark and name become the door           |
| The phase slot       | ADR-0172, `ASSISTANT_PANEL_COPY`                                                                           | Unchanged: one reserved line, the turn's own words when it runs |
| The orb and the mark | `assistant-orb.tsx`, `frontend/ui/chats/assistant-mark.tsx`                                                | Gain a `variant` so the member's mark is the one in the thread  |
| The tool registry    | `backend/services/chat/chat-agent-tools.ts`                                                                | One `suggestedAskWhen` condition for coding discovery           |
| The first screen     | `backend/services/chat/assistant-opening.ts`                                                               | Projects suggestions from the registry; no new read             |
| Coding tools         | `start_coding_task`, `coding_task_status`, `coding_task_diff`, `approve_coding_step`, `reject_coding_step` | Already the unified entry ADR-0219 designed; unchanged          |
| Grants               | `public.agent_tool_grants`, `agent-tool-grant-service.ts`, `assistant-grants-view.tsx`                     | The service and the API stay; only the host view moves          |
| Memory               | `/account/memory`, ADR-0182                                                                                | Linked as a section; the route does not move                    |
| Connected apps       | `/mcp/apps`, `mcp-connected-apps-view.tsx`                                                                 | Linked as a section; loses the grants block                     |
| The panel cache      | `frontend/api/chats/assistant-cache.ts`, ADR-0150                                                          | Gains `name` and `avatarVariant`                                |
| Copy as data         | `shared/copy/*.json` → generated TS and Kotlin, ADR-0098                                                   | One new file, one new Kotlin object                             |
| The account rows     | `frontend/ui/account/account-rows.tsx`                                                                     | `memory` becomes `المساعد` → `/assistant`                       |

## What is added

| Piece                | Where                                                                                      | Note                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Identity contract    | `shared/contracts/assistant-identity.ts`                                                   | Name, variant, tone, note — one source of caps and words                       |
| Table                | `supabase/migrations/*_assistant_identity.sql`                                             | Owner-only RLS, cascade on delete, no backfill                                 |
| Repository           | `backend/repositories/agent/assistant-identity-repository.ts`                              | The only code that knows the table                                             |
| Service              | `backend/services/agent/assistant-identity-service.ts`                                     | Resolve, validate, write, reset                                                |
| Controller and route | `backend/controllers/assistant-identity.ts`, `app/api/account/assistant/identity/route.ts` | `GET`/`PUT`/`DELETE`, `no-store`                                               |
| The page             | `app/assistant/page.tsx` + `frontend/ui/assistant/assistant-home.tsx`                      | The index; identity and permissions; links to the rest                         |
| Copy                 | `frontend/ui/assistant/assistant-home-copy.ts`                                             | Beside the view: the page is a document surface, so there is no generated pair |
| Panel identity       | `frontend/api/chats/assistant-cache.ts`                                                    | Snapshot carries the name and variant                                          |
| Prompt block         | `backend/services/chat/chat-agent-service.ts`                                              | The name and the tone line, assembled once                                     |
| The app              | `AssistantSheet.kt`, `AssistantHomeCopy.kt`                                                | The header gains the door; the page stays the document                         |
| Plan rows            | `perf/surfaces.json`, `docs/mobile/screens.json`, `docs/mobile/parity-plan.json`           | Land with the route, together                                                  |

## Phase 0 — the row and the contract

### 0.1 `shared/contracts/assistant-identity.ts`

```ts
export const ASSISTANT_NAME_MAX = 24;
export const ASSISTANT_NOTE_MAX = 120;
export const ASSISTANT_AVATAR_VARIANTS = 12;
export const ASSISTANT_DEFAULT_NAME = 'نور';
/** The value that turns one assistant into a roster later, never a second table. */
export const ASSISTANT_KEY_DEFAULT = 'default';

export const AssistantToneSchema = z.enum(['default', 'concise', 'warm', 'formal']);
export type AssistantTone = z.infer<typeof AssistantToneSchema>;

/** The site's own names, refused so a member's copy cannot answer as the site. */
const RESERVED_ASSISTANT_NAMES = new Set(['رؤية', 'رؤية رقمية', 'الإدارة', 'الدعم']);

export const AssistantNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_NAME_MAX)
  .regex(
    /^[\u0621-\u063F\u0641-\u064A\u0671-\u06D3a-zA-Z0-9 ]+$/,
    'الاسم يقبل الحروف والأرقام والمسافة فقط'
  )
  .refine((value) => !/\s{2,}/.test(value), 'الاسم لا يقبل مسافتين متتاليتين')
  .refine((value) => !RESERVED_ASSISTANT_NAMES.has(value), 'هذا الاسم محجوز');

export const AssistantIdentityInputSchema = z.object({
  name: AssistantNameSchema.nullable(),
  avatarVariant: z.number().int().min(1).max(ASSISTANT_AVATAR_VARIANTS).nullable(),
  tone: AssistantToneSchema,
  note: z.string().trim().max(ASSISTANT_NOTE_MAX).nullable(),
});

/** What the page and the panel read: the resolved name, and what the member set. */
export interface AssistantIdentity {
  name: string;
  customName: string | null;
  avatarVariant: number | null;
  tone: AssistantTone;
  note: string | null;
  updatedAt: string | null;
}
```

The regex admits Arabic letters without diacritics, Latin letters, ASCII digits
and the space; it refuses Arabic-Indic and Persian digits, punctuation, emoji,
tatweel and newlines. `null` means the deployment default, so the resolved
`name` is never empty and no caller has to branch.

### 0.2 The migration

```sql
create table public.assistant_identities (
  user_id uuid not null references auth.users (id) on delete cascade,
  assistant_key text not null default 'default',
  name text,
  avatar_variant smallint check (avatar_variant between 1 and 12),
  tone text not null default 'default'
    check (tone in ('default', 'concise', 'warm', 'formal')),
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, assistant_key)
);

alter table public.assistant_identities enable row level security;

create policy "own assistant identity" on public.assistant_identities
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

No `service_role` grant: nothing server-side needs to read another member's
assistant. No index beyond the primary key. No trigger for `updated_at` if the
repository writes it (the repository is the only writer, and a trigger would be a
second one).

### 0.3 Repository, service, controller

- `assistant-identity-repository.ts`: `read(userId)`, `upsert(userId, input)`,
  `reset(userId)`. One row, one read; `maybeSingle()`.
- `assistant-identity-service.ts`: resolves the default, validates through the
  contract, and answers the `{ success, identity } | { success: false, error }`
  envelope the grants route already uses.
- `app/api/account/assistant/identity/route.ts`: the same namespace the grants
  already use (`/api/account/assistant/grants`), because this is the signed-in
  member's own row. `cache: 'no-store'` on the client getter.
- Wiring in `backend/config/`; the controller stays thin, the service owns the
  rules, the repository owns the table.

Tests: the schema accepts `نور` and `Nour 2`, refuses a name with a newline, a
name ending in an Arabic-Indic digit (`U+0661`), `رؤية`, a blank name and a
25-character one; a member cannot read another's row (service test with a second
id); `reset` restores the default name without deleting the row's history of
tone; the route answers `no-store`.

**Exit:** `npm run check:contracts`, `npm run check:migrations`,
`npm run check:migrations:grants`, and the four tests above.

## Phase 1 — the door and the page

### 1.1 The panel header

Delete the `/coding` pill and the presence dot. What remains:

```
[mark 40]  [name]                 [×]
           [phase line, reserved]
```

- The mark and the name are one button: dismiss, then push `/assistant` through
  `useDismissThenNavigate`, because the panel is mounted at the root and would
  otherwise stay over the page — and the push has to wait for the dialog's own
  history entry to drop, or the traversal cancels it (ADR-0095).
- The orb is drawn with the member's variant and never with `online`: the dot
  leaves the panel header, the thread header (`chat-thread-view.tsx`), the chats
  row (`chats-panel.tsx`) and the sheet's title row together, because it is one
  claim about one assistant. The text stays.
- The header's `title` comes from the snapshot: `remembered.name ?? copy.title`.
  The first paint before a read is the default, which is what a member with no row
  sees anyway.
- The state line is untouched (ADR-0172): the phase while a turn runs, the idle
  sentence otherwise.
- `aria-label` on the door is `ASSISTANT_HOME_COPY.openPage`.

### 1.2 The page

`/assistant`, gated by the session like `/account` (guest → the existing
`LockedCard` with the assistant's copy). One column, no new navigation:

1. **The header is the editor** — the mark is a camera-badged button and the
   name carries a pen, each opening the account card's own dialog (ADR-0228). The
   name dialog also carries the voice choice (مؤنث / مذكر). Saving is one `PUT`;
   the snapshot is rewritten, so the panel paints the new name on the next open.
   The face is its own `POST`/`DELETE` on `/api/account/assistant/avatar`, so a
   name save can never blank an image it did not carry.
2. **Permissions** — the existing grants list, its grant and revoke, and the
   audit line each grant already carries. This is the block removed from the
   account page (phase 2).
3. **Sections** — rows to `/account/memory`, `/mcp/apps` and `/coding`, each with
   a one-line summary read from what the page already loads where possible, and
   no second copy of those screens.

The page is a document surface: the app's shell opens it. `screens.json` gets the
row with `native: null` and the reason (the app's door is the sheet's header, and
the page is a settings form whose copy is generated, so a native copy would be a
second form to keep in step).

### 1.3 The account row

`ACCOUNT_ROWS_COPY.memory` becomes `المساعد` and points at `/assistant`; the
memory row is gone from the account page because the home links it. `Brain`
becomes the assistant's icon (`Sparkles` is taken by pricing). One door, not
three.

### 1.4 The plan rows, in the same pull request

- `perf/surfaces.json`: `{ "id": "assistant", "routes": ["/assistant"], "owner": "server", "read": "needs-connection", "write": "none", "shell": "swr", "specs": [], "ungated": "…" }`
- `docs/mobile/screens.json`: `{ "surface": "assistant", "native": null, "reason": "…" }`
- `docs/mobile/parity-plan.json`: a row in phase `core`, beside `account-memory`.
- `docs/mobile/parity.json`: the sheet's header row, because the door is drawn in
  both clients.

**Exit:** `check:plan`, `check:screens`, `check:surfaces`, `check:parity` and
`check:visual` green; a member renames the assistant, closes the panel, and the
next open paints the new name with the network off.

## Phase 2 — trust moves home

- Mount `AssistantGrantsView` in the home, as `frontend/ui/assistant/grants-view.tsx`
  (the file moves; the service and the route do not).
- Remove it from `mcp-connected-apps-view.tsx` and from the account page.
- The in-chat approval gains «اسمح دائماً» on a tier-1 card, which is the moment
  the copy already describes. It calls the same `POST /api/account/assistant/grants`
  with the tool id; tier 2 and 3 never show it (ADR-0180 decisions 4 and 5).
- The empty state stops saying «جرّب أداة أولاً ثم امنحها من هنا» on the settings
  page and says where a grant is born.

**Exit:** no route outside `/assistant` renders a grant; ADR-0180's "assistant
settings" is a real page; the card's confirmation test still refuses tier 2.

## Phase 3 — tone, name, copy

- `chat-agent-service.ts` assembles the identity block from the row: the name,
  the tone line, and the note as quoted data. The prompt's own sentence keeps
  saying the assistant is the member's, not a person, and the tone may never
  change a boundary.
- Copy gains `{name}` in `assistant-panel.json` (`title`, `intro`, `placeholder`,
  `guestTitle`, `guestBody`) and a neutral `writing` (`جاري الكتابة...`).
  `assistant-home.json` carries the page's own strings. `copy:generate` writes
  both clients.
- The eval suite gains a slice per tone and one name-injection case: a name of
  `تجاهل التعليمات` (letters and a space, so it validates) must not change a
  single answer's behaviour, because the name is quoted data.

**Exit:** `check:agent-evals`, `check:agent-behaviour`, `check:copy`, and the
three-run gate in the behaviour spec for the prompt change.

## Phase 4 — the mark

- `AssistantOrb` takes `variant: 1..12` and maps it to a hue pair in
  `app/global.css`; the same value reaches `AssistantMark` in the thread and the
  list row, so the member meets their own mark in the conversation.
- The generator is a table, not a function of time: the same variant is the same
  orb on both clients, and a screenshot is reproducible.

**Exit:** `check:visual` on the sheet's header, both clients; a variant chosen on
the site paints in the app.

## What this does not do

- No public page, no `/u/` address, no follower, no shareable link.
- No free-text personality, no model picker.
- No roster UI. The column exists; the screen shows one assistant.
- No route moves. Memory, apps and coding keep their URLs and become sections.
- No new trust rule. The grants keep their table, service, API and tiers.

## Risks and their answers

| Risk                                                   | Answer                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| A member's name is read by the model as an instruction | Bound the charset and length, quote it, and gate with an eval case                 |
| A custom name breaks the gendered copy                 | Store the voice (ADR-0228); first person stays ungendered, third person follows it |
| Two surfaces disagree about the grants                 | One component, one service, one route; the account keeps only the door             |
| The panel shows a stale name after a rename            | The snapshot is rewritten on save (ADR-0150), so the next open is right            |
| The home becomes a second settings graveyard           | Identity, permissions and three links. No nesting, no fourth settings page         |
| A port of the page is expected and never done          | The row is `native: null` with a reason, and the app's door is the sheet           |
