# The assistant program

What it takes for «نور» to have eyes, hands, ears, memory and time — on one registry and one
trust model — without giving a language model ambient authority over a member's account.

Status: accepted program, phases land as separate pull requests. Decisions:
[0180](../adr/0180-a-write-carries-a-tier-and-trust-is-granted-per-tool.md),
[0181](../adr/0181-the-eyes-are-the-screens-own-state.md),
[0182](../adr/0182-memory-is-identity-facts-and-cited-recall.md),
[0183](../adr/0183-one-tool-registry-serves-the-agent-and-the-mcp-server.md),
[0184](../adr/0184-a-scheduled-run-is-a-turn-without-a-witness.md),
[0185](../adr/0185-an-embedding-model-is-not-the-chat-model.md).

## Where it stands

Verified against this checkout, not estimated.

| Piece             | Today                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Turn              | `ChatAgentService.turn` streams over SSE, bounded rounds, one clean retry, a turn row, a resumable runner |
| Tools             | 22 first-party declarations (11 read, 11 write); 21 on a turn with no connected app                       |
| Writes            | proposed as a card, executed only by the member's confirm on their own session                            |
| External apps     | router + `find_app_tools`; `readOnlyHint` runs, the rest cards; 3 calls per turn, 2 per connection        |
| Own MCP server    | 37 tools over 7 products, OAuth, scopes, plan caps, user-scoped client                                    |
| Skills            | 284 vendored specialists, reachable through `list_specialists` and `load_specialist` only                 |
| Attachments       | image, PDF, document, text, voice — read inside the turn                                                  |
| Memory            | the last 20 messages, trimmed to a token budget. Nothing else                                             |
| Page awareness    | none. The panel is on every screen (ADR-0143) and knows nothing about it                                  |
| Scheduling        | none on the agent. Cron exists only for sweeps                                                            |
| Account awareness | name only, through `change_display_name`. No profile read                                                 |
| Plans             | paid-only, member and project counters, per-day reset at Damascus midnight                                |

### The coverage table

The gap is not "more tools". It is that two registries hold different halves of the same
product, and six of the nine sheet apps have no tool at all.

| Product             | Assistant | MCP server | Missing                                  |
| ------------------- | --------- | ---------- | ---------------------------------------- |
| News                | 0         | 0          | read                                     |
| Rates               | 0         | 0          | read                                     |
| Scan                | 0         | 0          | read history, act                        |
| Quran               | 0         | 0          | read, bookmarks, progress                |
| Athkar              | 0         | 0          | read, completion                         |
| LinkSnap            | 0         | 5          | both                                     |
| HabitFlow           | 3         | 6          | read, logs, archive                      |
| SpendTrack          | 3         | 9          | budgets, categories, reports             |
| Notes               | 0         | 0          | both                                     |
| Community           | 4         | 7          | comments, reactions, reports             |
| Account             | 1         | 2          | profile read, username, avatar, sessions |
| Consultations       | 2         | 0          | bookings, reschedule, cancel             |
| Training            | 1         | 0          | enrolment state                          |
| Client work         | 1         | 0          | request state                            |
| MCP store           | 0         | 0          | connect, disconnect, trust               |
| Inbound MCP clients | 0         | 0          | list, revoke                             |
| Admin               | 0         | 0          | scoped reads, audited writes             |

## The shape

One turn is assembled from four context layers, in this order, each with its own budget:

1. **Identity** — the account's own row: name, username, email, avatar, plan, locale, timezone.
   Deterministic, no tool call, never the model's guess (ADR-0182).
2. **Screen** — the surface's own state: route, product, screen id, open overlays, focused
   record, allowlisted fields (ADR-0181). Session-scoped, redacted, never persisted.
3. **Memory** — saved facts plus cited recall, on top of a rolling thread summary (ADR-0182).
4. **Thread** — the last exchange, as today.

Capability comes from **one declarative registry**: `{id, product, mcpName, agentName, schema,
kind, tier, scope, handler}`. The MCP server and the assistant are two adapters over it
(ADR-0183). Authority comes from **tiers, not from a flag**: every entry declares its blast
radius, and trust is a row granted per tool (ADR-0180). Time comes from **a queue**: a scheduled
run is a turn with a ceiling, a budget and a digest (ADR-0184).

## Invariants

These do not change in any phase. A proposal that breaks one is refused, not debated.

- **The member is the caller.** `userId` comes from the session, never from a tool argument, and
  every schema is strict.
- **RLS is the boundary.** Both doors run on the member's own client. The service role is never
  a read path in a product surface.
- **Every write has a tier.** A missing tier fails the build. There is no default.
- **The confirm path is the only writer** for tiers 2 and 3, and the same executor writes the
  audit row for a granted tier 1.
- **Remote text is data.** A tool of an app we do not own can never carry instructions into the
  model, and a recall can never carry a command.
- **Attention is bounded.** Tokens, rounds, remote calls, recall items, skill bodies and run time
  all have a ceiling that is enforced outside the model.
- **Two clients or a reason.** A surface the assistant can see or act on is a pair (ADR-0098), or
  the row in `docs/mobile/parity.json` says why it is not.
- **A model change is a measurement**, not an opinion (ADR-0185).

## Phases

Each phase is one or more pull requests, lands green, and leaves the previous phase working.
Phases 1 and 2 are independent and can be swapped; the registry in phase 0 is the base both
stand on.

### Phase 0 — One registry, one identity

The foundation. Nothing else is safe to build on two registries.

- Extract `ToolEntry` and the two adapters; move the 22 agent tools and the 37 MCP tools under
  it with their current names.
- Add `tier` and `scope` to every entry. Tier assignments come from the table in ADR-0180.
- Add `GET /api/me` projection as the identity block, injected before the system prompt.
- Read `permissionLevel: 'all'` as the app's tier 0 and 1 tools; keep the column, change what it
  means, and migrate nothing (ADR-0180, decision 6).
- Parity test: every entry projects to both doors, or carries a documented exemption.
- One file lists the coverage matrix above, generated from the registry so it cannot be stale.

**Exit:** `npm run check:tools` proves both projections exist; the turn behaves identically for
a member with no grants.

**Cost:** mostly mechanical. The risk is the MCP tool names moving — they must not.

### Phase 1 — Eyes

- `shared/contracts/screen-context.ts`: the snapshot type, the redaction list, the token cap.
- A route provider and an overlay registry in the site shell; a settle debounce; a session store.
- The turn carries the snapshot as a system block and says it cannot see a surface that opted
  out.
- Compose publishes the same snapshot; `docs/mobile/parity.json` gains the row; the visual gate
  is unchanged.
- `security-review` is mandatory on this change: it is the first time the agent reads the page.

**Exit:** for each of the 39 surfaces in `docs/mobile/screens.json`, a fixture proves the
snapshot is either meaningful or explicitly empty; no password, OTP, token or payment field can
appear in a captured snapshot, proven by a test that tries.

### Phase 2 — Memory

- `agent_memories` and `agent_memory_embeddings` with RLS, plus the account-deletion cascade.
- The identity block stays layer one; facts are layer two; recall is layer three.
- Fact extraction runs after the answer, never in front of the stream, with a strict schema and a
  confidence floor.
- Rolling thread summary past the 20-message window.
- Account settings: view, edit, delete, export, per-scope toggle, "forget this conversation".
- `remember` as an explicit tool, so "remember that I prefer …" is a real promise.

**Exit:** a new conversation on day 30 knows the member's name, their stated preferences and the
one fact they asked to be remembered, and every injected item is traceable to a row.

### Phase 3 — Hands

- One tool pack per product, in the coverage table's order: LinkSnap, Notes, HabitFlow,
  SpendTrack, Community, Account, Consultations, Training, Client work, then the three content
  apps (News, Rates, Quran, Athkar, Scan).
- Admin entries last: behind `admin` scope, audited, declared only inside a verified admin's turn,
  and refused at execution without the flag. Reads are tier 0; writes are tier 2 or 3 and never
  grantable (ADR-0180, decision 10).
- MCP store and inbound clients: connect, disconnect, revoke, and grant a tool.
- Trust settings: the grants list, revoke, and the audit trail. The apps sheet draws the same
  rows.
- Budgets revisited with measurements, not guesses: the 3-call turn cap and the 2-call
  connection cap are re-derived from the eval runs.

**Exit:** every row of the coverage table has at least a read and, where the product has a write,
a tiered write; a member can grant and revoke each of them.

### Phase 4 — Time

- `agent_tasks`, the claim/lease runner, the budget, the digest, the undo, the kill switches.
- `profiles.timezone` in the same migration as the task row, so no reminder is ever created
  without the zone it means (ADR-0184, decision 10).
- Reminders first (no tools), then read-only digests, then tier-1 actions.
- Delivery: the assistant thread plus push; no email until one exists.

**Exit:** a scheduled run at 06:00 records an expense the member asked for, cannot publish a post
or message a third party, and leaves one digest line with an undo that works.

### Phase 5 — Skills

- Embed the 284 specialists; route top-k instead of a two-call guess; load at most one body per
  turn by default, with `maxResultChars` honoured.
- Per-skill outcome telemetry: did the answer that loaded it score better on the eval suite?
- A skill the answer never used costs nothing and is not loaded.

**Exit:** a routing fixture set of 60 questions lands on the right specialist at least 80% of the
time, versus the lexical baseline measured first.

### Phase 6 — Trust surface and proof

- Admin console: turns, actions, grants, tasks, memory, failures, cost.
- Eval suite and red-team suite as gates: injection from a remote tool, cross-member access,
  exfiltration through a write, an escalation inside a scheduled run.
- A "what the agent knows and can do" page for the member: memory, grants, tasks, connected apps,
  in one place.

**Exit:** the suites run in CI; a regression fails the pull request that caused it.

## Non-goals

- **Raw DOM capture.** It misses portals, breaks on refactors, and will eventually read a
  password field. The eyes are the app's own state (ADR-0181).
- **A global auto-approve switch.** Trust is per tool or it is not trust (ADR-0180).
- **Unbounded memory.** A recall that always injects everything is a cost line with a privacy
  problem, not a feature.
- **Unattended tier 2 or 3.** No schedule publishes, messages, pays or deletes (ADR-0184).
- **A second provider per member.** One deployment key, one model at a time, measured
  (ADR-0185).
- **A separate agent service.** The turn stays inside this deployment; a queue is a table, not a
  new runtime.

## Cost

The budget the work has to fit inside:

- **Per turn:** +600 tokens of screen, +400 of identity, +800 of memory, against today's
  `CHAT_AGENT_TOKEN_BUDGET`. The turn's ceiling does not rise; the history window shrinks to
  pay for it, and the summary carries what the window drops.
- **Recall:** one embedding call per stored item, batched; six items per turn.
- **Scheduled runs:** one run per member per task, budgeted, and a run that spends its budget
  stops rather than retries.
- **The Hobby deployment** ([vercel-usage.md](../vercel-usage.md)): cron is daily, so scheduled
  runs are dispatched by one daily call that drains due rows, not by a per-minute cron.

## Risks

| Risk                                                                     | Mitigation                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| The registry refactor breaks the MCP contract external clients depend on | Names are frozen; a contract test pins all 37                                              |
| Eyes leak a secret                                                       | Structural redaction, allowlist per surface, `security-review` gate, a test that tries     |
| Memory stores something the member never meant to keep                   | Explicit categories never stored, confidence floor, visible and deletable, export          |
| A grant becomes a habit and the member stops reading cards               | Tier 2 never grantable; tier 3 needs a typed target; the digest names every autonomous act |
| A scheduled run loops or spends                                          | Lease, budget, kill switch, two retries, a spent budget ends the run                       |
| Arabic tool-calling regresses on a model change                          | The eval suite is a gate, not a report                                                     |
| Two clients drift                                                        | The pair rule and `check:parity` already enforce it; new surfaces register in both         |

## Pull requests

Ordered, each independently reviewable.

1. `tools: one registry, two doors` — phase 0, no behaviour change.
2. `assistant: the identity block` — phase 0, one system line and its test.
3. `assistant: the screen is the context` — phase 1 web.
4. `android: publish the same screen snapshot` — phase 1 native pair.
5. `assistant: saved facts and cited recall` — phase 2 schema and turn.
6. `account: the memory page` — phase 2 surface, web + Android.
7. `tools: the nine products, read side` — phase 3, first half.
8. `tools: the nine products, write side with tiers` — phase 3, second half.
9. `assistant: trust, grants and the audit trail` — phase 3 surface.
10. `assistant: a scheduled run is a turn without a witness` — phase 4.
11. `assistant: skills by meaning` — phase 5.
12. `admin: the agent console` + the eval suites — phase 6.

## Settled

Decided before phase 0, because each is schema-shaped and a later change would be a data
migration with a behaviour change:

- **Clocks split.** A scheduled run uses the member's IANA zone (`profiles.timezone`, snapshotted
  onto the task); every meter and daily reset keeps the Damascus day (ADR-0184, decision 10).
- **`all` narrows immediately.** An existing connection's `all` becomes its tier 0 and 1 tools, no
  migration and no retroactive grants, with one line in the thread the first time it cards
  (ADR-0180, decision 6).
- **Admin tools are in the turn, narrowly.** Admin writes are tier 2 or 3 and never grantable;
  admin reads are tier 0; nothing appears in a scheduled run; the card carries a visible admin
  mark; and no page snapshot is published while an admin surface is open (ADR-0180, decision 10;
  ADR-0181, decision 8). The boundary is `isAdmin` re-read at execution, so a turn without the
  flag is refused by the handler rather than trusted to have been filtered.
