# 0223. A connected app is selected by capability, and ranked by meaning

## Status

Accepted (2026-11-26). Implements #1917. Amends
[ADR-0155](./0155-the-app-picker-hosts-apps-we-do-not-own.md) decision 7 (the
sixteen-tool router) and reuses the embedding generation of
[ADR-0185](./0185-an-embedding-model-is-not-the-chat-model.md) and
[ADR-0190](./0190-embedding-generation-is-a-table-not-a-reindex.md).

## Context

The promise after «اربط تطبيقاً» is that نور can call that app's tools. Each turn
declares at most sixteen of them, chosen from the member's own words by a lexical
matcher over the tool's name, description and app. The product is Arabic-first
and both connected servers advertise English names and descriptions, so the two
sides shared no word.

Production was the reproduction: three connections, two active with 321 enabled
tools, **0 `mcp.call` usage events ever**, every `last_used_at` null, one tool
grant created and revoked without a use, and the only `chat_agent_actions` row
the internal `remember` tool. Both active connections belonged to the admin
account that wrote 40 of the 50 non-harness turns.

Two defects, not one:

1. **No shared word.** Running the real planner over the exported 321 tools,
   `انشر الموقع على الإنترنت`, `كم عدد زوار موقعي هذا الأسبوع؟`,
   `استخدم فيرسل وانشر الموقع` and `كم عدد المستخدمين في قاعدة البيانات؟` each
   declared **0** tools. The English equivalents declared 16 — but only because a
   Latin word was present.
2. **The app's name was a registry key.** The 285-tool connection is stored as
   `com.vercel/vercel-mcp`, so a message containing the bare token «mcp» scored
   +4 on all 285 and returned sixteen unrelated tools
   (`accept_project_transfer_request`, `create_kms_issuer`).

The recovery path, `find_app_tools`, ran the model's query through the same
matcher, so a model writing the query in Arabic recovered nothing either.

Two measurements shaped the decision below. Both are reproducible with
`npm run check:app-tools` against the pinned fixture (the 321 production rows
and 40 Arabic questions).

**A similarity floor cannot be the gate.** With the deployment's own model
(`@cf/baai/bge-m3`, 1024) a relevant question's best tool reaches as low as
**0.373**, and an unrelated one's reaches **0.511**. `كم صرفت هذا الشهر؟` is
closer to this catalog than `ما هي آخر عمليات النشر؟` is. Any floor low enough to
declare the relevant question declares tools for the unrelated one; any floor
high enough to keep the unrelated question quiet loses most of the recall.

**Vocabulary is the gate, meaning is the ranking.** With the capability
vocabulary below, the questions and the controls separate cleanly — and the
vectors then order what the words admitted:

|                      | reaches a tool | correct tool first | in the first three |
| -------------------- | -------------- | ------------------ | ------------------ |
| vocabulary alone     | 20/20          | 8/20               | 15/20              |
| vocabulary + meaning | 20/20          | **11/20**          | **20/20**          |

The controls declare nothing in either case (0/20), and the recovery search
reaches the same tool for 20/20.

## Decision

1. **The gate is a capability vocabulary, not a translation of the tools.**
   `backend/services/chat/app-tool-vocabulary.ts` maps an Arabic word to the
   English words the app ecosystem uses — publish → deploy, visitor → pageview,
   log, error, environment, domain, project, table, database, user, url, key,
   documentation, comment, price, cancel, status, function, gateway, board,
   team, build, search, list, create, delete, update. Thirty entries serve every
   server that has the capability; a new server adds none. Its match is by stem
   and by prefix, so «زوار» finds «زيارات» and «والمشاريع» finds «مشاريع», and a
   two-letter prefix («لي» → «لينك») never counts as a word.

   This is deliberately not the rejected patch. A per-tool translation is 321
   descriptions today and every new server tomorrow; a capability vocabulary is
   the same shape ADR-0185 already accepted for the specialist roster, and the
   routing fixture is what keeps it honest.

2. **Meaning ranks, and declares only when it is unambiguous.** A tool declares
   itself when the message names its app, names something it is called, says two
   things it does, or scores **0.55** or more by cosine. The number is above the
   control maximum measured above (0.513), so it is a narrow extra path for a
   question whose words miss, not the gate.

3. **The vector is written where the tools are read, and never on a turn's read
   path.** The connect flow — and `npm run mcp-tools:embed` for the rows that
   existed — embeds `app: tool name. description` at the deployment's 1024 width
   into `mcp_connection_tool_embeddings_1024`, with the model and a hash of the
   text. A re-sync re-embeds only the tools whose text moved; a provider that is
   absent, slow or refuses leaves the connection connected and the router on
   vocabulary, which is also the day-one path before any vector exists.

4. **A turn reads similarities, not vectors.** `mcp_tool_nearest_1024` ranks the
   member's own tools for a query vector the turn already spent (#1448) and
   answers at most 32 rows. Shipping the vectors to the application would be 321
   × 1024 floats per message; the function returns a few bytes per tool. There is
   no HNSW index on purpose: a member's catalog is hundreds of rows, and Postgres'
   exact ordering is both cheaper and always right at that size.

5. **An app has a name before it has a registry key.** `appDisplayName` keeps the
   member's own name and, when the row only has a registry key, derives the brand
   from it (`com.vercel/vercel-mcp` → `Vercel`). The key is never a router word,
   which is what made «mcp» match all 285 tools.

6. **One selection serves the router and the recovery.**
   `find_app_tools` embeds the query the model wrote instead of the member's
   message and reads the same vectors, so a miss and a hit cannot disagree about
   what a tool means. The recovery spends one embedding call, like one search.

7. **The 16-tool cap and the turn's token budget do not move.** This change buys
   recall inside the same envelope; it does not widen it.

## Why not the alternatives

- **Embeddings as the gate.** Measured above: the model cannot separate a
  relevant Arabic question from an unrelated one at this catalog size. Shipping
  the floor alone would either flood or starve.
- **A raised cap.** ADR-0155 rejected it on cost and on model accuracy, and this
  measurement does not reopen either.
- **Hand-translated tool descriptions or an Arabic glossary of tool names.** It
  rots at 321 tools and 48,880 catalogue servers, and every new server reopens
  the gap. A capability vocabulary is the smallest list that does not grow with
  the catalogue.
- **A model call to route.** The issue's non-goal, and a per-turn provider spend
  in front of the stream. The turn's query vector is already paid for by recall.
- **Cosine in the application.** It would move 321 × 1024 floats — several
  hundred kilobytes — on every message, to compute something the database can
  answer with an exact order.

## Consequences

- The acceptance fixture is `backend/services/chat/__tests__/fixtures/`
  (`app-tool-catalog.json`, `app-tool-routing.json`), pinned by
  `npm run app-tools:routing` and checked without a provider by
  `npm run check:app-tools`. `chat-app-tool-routing.test.ts` fails below 80% of
  the questions reached, on any control declaring a tool, or on any answer above
  sixteen.
- The seeded turn test (`chat-agent-service.test.ts`) runs the production
  question `ما هي آخر عمليات النشر؟` through the whole turn against the pinned
  catalog and vectors, and asserts the app is called and the `mcp.call` counter
  is taken — the usage event production had never recorded.
- Existing connections need `npm run mcp-tools:embed` once; until then they route
  on vocabulary, which the measurement above says already reaches every question
  in the fixture.
- **The review trigger is the issue's own:** the first external tool call within
  seven days of a new connection, for 50% or more of new connections. If members'
  English queries already produce calls, or the semantic selection costs more per
  turn than it returns, revert to the lexical router and record the measurement.
- **The next step, if the trigger is met but coverage is not:** the issue's
  long-term fix — a small member-facing capability list in Arabic, summarised at
  connect time — replaces the static vocabulary with per-connection words the
  member wrote or approved. It must beat this fixture's 20/20 / 0/20 before it
  replaces anything.
