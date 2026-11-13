# 0183. One tool registry serves the agent and the MCP server

## Status

Accepted (program). Phase 0 lands in two changes: the declaration first — one table per door,
measured against what each door actually registers — then the handlers, because every MCP handler
currently owns its own markdown and a shared handler needs a domain answer plus a per-door
format.

## Context

The same product is declared twice.

`chat-agent-tools.ts` holds 22 hand-written tools: a name, a Zod schema, an Arabic description,
and a call into the product's service. `backend/services/mcp/tools/*.ts` holds 37 tools over
seven modules, registered directly onto an `McpServer`, each with a scope guard and a
markdown-or-json response shape.

They overlap partially, and the overlap has already drifted:

| Product      | Assistant | MCP |
| ------------ | --------- | --- |
| HabitFlow    | 3         | 6   |
| SpendTrack   | 3         | 9   |
| LinkSnap     | 0         | 5   |
| Community    | 4         | 7   |
| Certificates | 1         | 7   |

Worse, the assistant reaches for products the MCP server does not have (consultations, training,
client work) and the MCP server reaches for products the assistant does not (LinkSnap). A member
asking the assistant for a short link is refused; an external client can create one. That is not
a capability gap, it is a bookkeeping gap.

Crucially, the authority is already identical. The MCP context carries a **user-scoped Supabase
client** with RLS; the assistant's tool context carries the same thing, for the same reason. Both
run as the member. The difference between the two doors is shape, not permission.

## Decision

**A capability is declared once, in a registry; the two doors are adapters.**

1. **`ToolEntry` is the declaration.**

   ```ts
   interface ToolEntry {
     id: string; // stable, e.g. spendtrack.record_expense
     product: string; // spendtrack
     mcpName: string; // royaraqamia_spendtrack_create_expense (frozen)
     agentName: string; // record_expense (frozen)
     title: string; // Arabic, for a card
     description: string; // Arabic, for the model
     schema: z.ZodTypeAny; // strict
     kind: 'read' | 'write';
     tier: 0 | 1 | 2 | 3; // ADR-0180
     scope: McpScope; // the MCP gate
     handler(ctx: ToolContext, args: unknown): Promise<unknown>;
     maxResultChars?: number;
   }
   ```

2. **Two adapters.** `toMcp(entry)` registers it on the MCP server with its scope guard and its
   response shape. `toAgentTool(entry)` projects the model-facing declaration and the turn
   executor, with the tier applied by the executor.

3. **One context.** `ToolContext` is `{ userId, supabase, ip, signal }`. The MCP context and the
   assistant context become projections of it, so a handler cannot tell which door it came
   through — and neither can drift.

4. **Names are frozen.** The 37 `royaraqamia_*` names are a public contract; an external client's
   configuration depends on them. The 22 agent names are in prompts and eval fixtures. Neither is
   derived from the other; the entry carries both, and a rename is an explicit, reviewed change.

5. **Parity is tested.** `npm run check:tools` asserts every entry projects to both doors, and
   that no product operation exists on one door only. An exemption (a tool that only makes sense
   to an external client, such as `get_server_info`) is a row with a reason, not a comment.

6. **The turn loop declares nothing.** It reads the registry, filters by tier and grants, and
   dispatches. A product's service is called from a handler, never from `chat-agent-service.ts`.

7. **Admin entries are last and narrow.** They require the `admin` scope, are declared only to an
   admin's turn, are tier 2 or 3, and are audited. A non-admin turn never sees their names.

## Considered options

- **Keep two registries.** Rejected: it is already drifting, and every new product is written
  twice.
- **Call our own MCP server over HTTP from the assistant.** Rejected: an extra hop, a token the
  assistant would have to hold for itself, and a second failure surface inside one turn.
- **Generate the MCP server from the assistant's tools.** Equivalent in shape, but the MCP
  surface is the older contract and its names must not move; the registry keeps both explicit.
- **One adapter with a mode flag.** Rejected: the two projections have genuinely different
  response shapes (markdown for a human-facing client, JSON for a model), and a flag would put
  both shapes in one function.

## Consequences

- A large mechanical refactor: 22 tools move, 37 registrations are rewritten as entries.
- The coverage table in the roadmap becomes generated, so "which product is missing" is a query
  rather than an audit.
- The tier and scope live next to the capability, which is the only place they can stay honest.
- The assistant gains LinkSnap and the missing halves of HabitFlow, SpendTrack, Community and
  Certificates the moment the refactor lands, without a second implementation.
- Tests: the MCP contract test pins all 37 names and their schemas; the agent projection test
  pins all 22 declarations.
