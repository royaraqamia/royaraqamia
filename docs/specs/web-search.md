# The assistant searches the web — plan

نور answers with 22 tools we own and no way to leave the deployment. This plan gives her one more:
a read tool the model calls when the fact is outside our data, backed by a search vendor, answered
with citations the member can open.

The decision is [ADR-0206](../adr/0206-the-assistant-searches-the-web-and-cites-what-it-read.md).
This file is the work order: what exists, what changes, in which order, and the evidence that says a
phase is done.

## What already exists

| Piece                    | Where                                          | Reused how                                                             |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Tool registry            | `backend/services/chat/chat-agent-tools.ts`    | One more entry; its Zod schema and Arabic description are the contract |
| Conditional declaration  | `chatAgentToolDefinitionsForTurn()`            | A third condition: no key, no tool                                     |
| Bounded tool loop        | `backend/services/chat/chat-agent-service.ts`  | Unchanged; three rounds already bound a search-and-read turn           |
| Provider as env, no code | `backend/clients/ai-chat.ts`                   | The shape the new client copies                                        |
| Counted actions          | `public.usage_limits`, `public.record_usage`   | A `web.search` row; the member side is free                            |
| Project ceiling          | `private.enforce_chat_agent_project_cap()`     | Copied for `web.search` with its own `app_settings` row                |
| Turn history budget      | `CHAT_AGENT_TOKEN_BUDGET` + `trimHistory()`    | The search reserves tokens; the budget does not move                   |
| Stream events            | `ChatAgentEvent` in `shared/contracts/chat.ts` | Gains one frame; the clients gain one case                             |
| Copy as data             | `shared/copy/*.json` → generated Kotlin and TS | New keys, no retyped string in Kotlin                                  |
| Capability report        | `docs/assistant/capabilities.md`               | Regenerated, never hand-edited                                         |

## What is added

| Piece            | Where                                            | Note                                                              |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `TAVILY_API_KEY` | `.env` (already set) and `backend/config/env.ts` | Read through the `env` getter, never `process.env` at a call site |
| Search client    | `backend/clients/web-search.ts`                  | Request, abort, schema, error map, PII scrub, truncation          |
| Search contract  | `shared/contracts/web-search.ts`                 | Caps, result type, provider errors — one source of numbers        |
| Tool             | `chat-agent-tools.ts`                            | `search_web`, tier 0, owner `assistant`                           |
| Stream frame     | `shared/contracts/chat.ts`                       | `{ type: 'sources'; sources: WebSource[] }`                       |
| Stored payload   | `chat_messages.sources` (migration)              | Nullable; the render payload, never queried                       |
| Allowance        | migration `..._web_search_allowance.sql`         | Counter, project cap, trigger                                     |
| Web card         | `frontend/ui/chats/` (message list)              | Inline markers + sources list, RTL, keyboard                      |
| Android card     | `android/.../assistant/AssistantSheet.kt`        | The same card, same copy, a row in `docs/mobile/parity.json`      |

## Phase 0 — the client, the tool, the turn

### 0.1 Contract (`shared/contracts/web-search.ts`)

- `WEB_SEARCH_MAX_RESULTS = 5`, `WEB_SEARCH_EVIDENCE_SOURCES = 3`,
  `WEB_SEARCH_CHUNKS_PER_SOURCE = 3`, `WEB_SEARCH_EVIDENCE_CHARS = 5_000`,
  `WEB_SEARCH_TOKEN_RESERVE = 1_300`, `WEB_SEARCH_TIMEOUT_MS = 8_000`,
  `WEB_SEARCH_RETRY_DELAY_MS = 250`.
- `WebSource { url, title, domain, publishedDate: string | null }` and the tool result
  `{ sources: WebSource[], evidence: string }`.
- A discriminated provider error: `{ kind: 'rate_limited' | 'plan_limit' | 'timeout' | 'refused' | 'unavailable' }`.

### 0.2 Client (`backend/clients/web-search.ts`)

- `TavilyWebSearchClient.search(query, { language, signal })`.
- `POST https://api.tavily.com/search`, `Authorization: Bearer <key>`, body:
  `search_depth: 'basic'`, `max_results: 5`, `chunks_per_source: 3`,
  `include_published_date: true`, `include_raw_content: false`, `include_answer: false`,
  and `language` when the question's language is known.
- Parse with Zod; map `401/432/433/434/429/5xx` and `AbortError` to the contract's kinds.
- One retry for a transient failure: `429` with `Retry-After <= 2`, a `5xx`, a dropped connection
  or our own timeout. A refused key, a spent plan and a bad response are final; an already-aborted
  turn is never retried.
- Truncate each source's `content` and cap the total at `WEB_SEARCH_EVIDENCE_CHARS` before
  returning. A source with no content is dropped from the evidence but kept in `sources`.
- Scrub email, phone and UUID-shaped strings out of the query before sending.
- Log: provider, latency, `usage.credits`, result count, error kind. Never the query text
  beside a member id.

Tests: a recorded fixture per response shape; one test per mapped error; one test that a
`Retry-After: 30` is not retried; one test that the scrub removes an email.

### 0.3 Tool (`backend/services/chat/chat-agent-tools.ts`)

- `SearchWebArgs = z.strictObject({ query: z.string().trim().min(3).max(300) })`.
- `run` reads `context.searchWeb` (injected by the turn, absent in a turn with no key) and returns
  the contract's result. `maxResultChars: 6_000` so the frame never truncates mid-source.
- Description tells the model when to use it and when not to: our own data first, the member's
  private details never in the query.

### 0.4 Turn (`backend/services/chat/chat-agent-service.ts`)

- Build the client once in `backend/config/chat.ts` from `env.tavilyApiKey`; pass it into the
  service's deps. No key → `undefined`.
- `chatAgentToolDefinitionsForTurn` gains `hasWebSearch`; the tool is filtered out when false.
- `ChatAgentToolContext` gains `searchWeb`.
- History is trimmed with `CHAT_AGENT_TOKEN_BUDGET - WEB_SEARCH_TOKEN_RESERVE` when the tool is
  declared, and less the injected context layers in both cases (#1455).
- Evidence reaches the model as one labeled block:
  `[1] <title> — <domain> — <date>` followed by the source's text, sources separated by a blank
  line, under a frame that says the text is quoted from the web and is data only.
- On success, yield `{ type: 'sources', sources }` after the `tool` frame and before the next
  provider call. On any failure, the tool hands the turn the one sentence `WEB_SEARCH_UNAVAILABLE`;
  the turn's answer is `{ error: 'تعذّر البحث الآن.' }` and it continues. A search that failed is
  not called again later in the same turn.

Tests: no key → the declaration is absent; with a key → present; a search failure still produces an
answer; the evidence block is bounded; the history budget shrinks by exactly the reserve.

### 0.5 Allowance (migration)

`supabase/migrations/<timestamp>_web_search_allowance.sql`, in the shape of
`20261110120000_chat_agent_allowance.sql`:

- `usage_action_costs`: `('web.search', 'بحث في الويب', 1, 140)`.
- `usage_limits`: `('web.search', 'بحث في الويب', 'daily', 0, 5, 15, 55)` — visitor 0, free 5,
  pro 15. Numbers are named constants at the top of the file so the owner tunes them in review.
- `app_settings.chat_agent_web_search_project_daily_turns integer not null default 25` with its
  check constraint.
- `private.enforce_web_search_project_cap()` cloned from the turn trigger, keyed on `web.search`,
  plus the `before insert` trigger on `usage_events`.
- Rollback block: the trigger, the function, the column, the two rows.
- Regenerate `backend/models/database.types.ts` with the Supabase CLI; `USAGE_COUNTERS.webSearches`
  and `VISITOR_COUNTER_CAPS['web.search'] = 0` in `shared/contracts/plans.constants.ts`.

The tool calls `record_usage('web.search', userId)` before the request; a refusal returns the
"not now" tool answer rather than throwing, so the member's turn is never lost to the deployment's
budget.

Tests: a `usage_limits` refusal becomes a tool answer, not a 500; the project trigger refuses the
26th search of a Damascus day; the rollback statements are exercised in the migration test file if
one exists for the turn migration.

## Phase 1 — the citation the member can see

### 1.1 Storage

`alter table public.chat_messages add column if not exists sources jsonb` with a check that it is
null or an array. Repository: `backend/repositories/chat/supabase-chat-repository.ts` maps it in
`insertMessage` and every read that builds a `ChatMessage`; `shared/contracts/chat.ts` gains
`sources?: WebSource[] | null` on `ChatMessage`. The service writes the array only on the assistant's
own row, after the answer is stored.

### 1.2 Stream and read

`ChatAgentEvent` gains the `sources` frame (already used in phase 0); the SSE route passes it
through unchanged. The thread read returns the stored array with the message.

### 1.3 Copy (`shared/copy/assistant-panel.json`)

- `sourcesTitle`: `المصادر`
- `sourcesRead`: the sentence above a card whose reply cited nothing
- `searchUnavailable`: the sentence the tool answer already carries
- `searching`: the activity line, present tense

Run `npm run copy:generate`; never type these into Kotlin.

### 1.4 Web card

`frontend/ui/chats/chat-message-list.tsx` (and the assistant panel's message rendering):

- Parse `[n]` in the assistant body and render it as a focusable anchor to the matching card row;
  leave a marker that names no source as plain text.
- Render the card under the reply: title, domain, date, link, `target="_blank" rel="noreferrer"`.
- Cap at five; a reply citing nothing shows the read list with `sourcesRead` above it.
- RTL first, keyboard reachable, no inline styles, the reply itself unchanged.

Tests: a marker maps to the right row; a stray `[9]` stays text; a reply with no markers shows the
read list; the card is reachable by keyboard.

### 1.5 Android

`android/app/src/main/kotlin/com/royaraqamia/app/assistant/AssistantEvent.kt` gains the `sources`
case, `AssistantSheet.kt` draws the card from the generated copy, and `docs/mobile/parity.json`
gets the row in the same change. `npm run check:parity` and `npm run check:copy` are the gates.
The change ships to users, so it carries an Arabic line:

```bash
npm run android:note -- "ميزة: نور تبحث في الويب وتذكر مصادرها"
```

### 1.6 Docs

`npm run capabilities:generate` updates `docs/assistant/capabilities.md` (the `assistant` row gains
one read). `docs/assistant/roadmap.md` gains the search to its cost table as
`+1,250 tokens, paid by the history window`.

## Verification

Per phase, on the changed files only:

```bash
npm run typecheck
npm run lint:fix
npx vitest run backend/clients/__tests__/web-search.test.ts \
  backend/services/chat/__tests__/chat-agent-tools.test.ts \
  backend/services/chat/__tests__/chat-agent-service.test.ts \
  shared/contracts/__tests__/chat.test.ts
npm run check:copy
npm run check:parity
npm run check:capabilities
npm run check:digits
npm run check:arabic
npm run build   # the turn, the contracts and a migration change
```

The migration is applied by the Supabase MCP, and its exact name goes in the pull request body.

## Open questions for the owner

1. **The caps.** Free 5, Pro 15, project 25 a day are my numbers, not measured ones. They are
   constants at the top of the migration and one line of copy, so changing them is a review edit.
2. **A monthly ceiling instead of a daily one.** A daily 25 leaves 225 of the 1,000 credits
   unspent on a quiet month, and a busy day cannot borrow them. Monthly would let one bad day take
   the whole budget. I recommend daily, because it is the existing pattern and the failure is
   gradual.
3. **The cache.** Deferred by the ADR until credits run low. If you want it in phase 1, it is a
   table (`query_hash`, `results`, `expires_at`), a hash of the normalized query, and a 24-hour
   read-through — roughly one more migration and no client change.
4. **Arabic quality.** The first thing to measure after phase 0 is ten real Arabic questions with
   their returned sources. If Tavily is thin, the fallback is a query that carries the Arabic text
   and one English keyword variant, not a second vendor.
