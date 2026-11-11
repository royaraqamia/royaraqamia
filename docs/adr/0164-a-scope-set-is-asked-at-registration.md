# A scope set is asked at registration, not at consent

Supabase is the first provider with a live connection, and the first connection was granted all
thirteen scopes it publishes — including `secrets:read`, `environment:write` and `storage:write`,
which no tool in its thirty-six-tool list uses (#1230). The cause was on our side: the flow asked
for no scope at all, on the reasoning that naming every scope the provider publishes would be the
widest possible consent on the strength of a guess. Supabase answered "no ask" with "everything",
which is the same consent without the guess.

The obvious repair — narrow the ask on the authorization URL — does not work at this provider. It
was measured on 2026-11-11 with isolated clients on a loopback redirect, and the answer changed the
design.

| What was sent                                                    | What came back                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| authorize `scope=database:read`, client registered with no scope | all 13 scopes in the token response                         |
| authorize `scope=totally:made-up`, same client                   | `303` to the consent page; not validated                    |
| client **registered** with `scope=database:read projects:read`   | exactly those two, and the same on refresh                  |
| `tools/list` on the two-scope grant                              | all 36 tools                                                |
| `execute_sql` on the two-scope grant                             | `403`, `error="insufficient_scope", scope="database:write"` |

## The decision

1. **The set is per catalogue row, in code, with the day it was measured.**
   `backend/config/mcp-scopes.ts` names the scopes a row asks for, in the provider's own words.
   A row absent from the table asks for nothing and takes the provider's default, which is exactly
   what every row did before the table existed — so no provider regresses by being unmeasured.

2. **It is sent twice: at registration and at authorization.** Providers disagree about which one
   they read, and the two cost the same. Supabase reads the registration and ignores the
   authorization URL; a provider that reads only the authorization URL would otherwise grant its
   default in silence. A set is stripped to what the provider still advertises, so a retired scope
   is dropped here rather than sent and refused at consent.

3. **The registration records the set it was created for.** Widening a provider that binds the
   grant to the client is a **new registration**, not a new consent through the old one: a cached
   client made for `database:read` keeps returning `database:read` however the member re-consents.
   `mcp_oauth_client_registrations.scope` is that record, and a mismatch re-registers on the next
   connect. A callback whose client no longer matches the row's set refuses to complete, because it
   would store the old grant under the new intent.

4. **Ask for what the tools use, not for what the provider publishes.** Supabase's entry keeps the
   reads and the writes — `organizations:read`, `projects:read`, `projects:write`, `database:read`,
   `database:write`, `analytics:read`, `edge_functions:read`, `edge_functions:write` — and leaves
   out the five nothing calls. Reads _and_ writes stay because the `ask` level already cards every
   write: a carded write that then fails for scope would be a worse experience than the card, and
   the card is the consent the member actually reads.

5. **A refusal names the permission.** RFC 6750's `insufficient_scope` carries the scope, and the
   provider's tool list does not: all 36 tools are advertised on a two-scope grant, so which one
   will run is only knowable at the call. The refusal is therefore its own failure, not a dead
   grant — `fix/1230`'s first half, `McpRemoteError.failure === 'scope'` — and the member is told
   the permission by name with the wider consent offered beside it.

6. **The consent screen we own says what will be asked.** The provider's own screen is theirs and
   in English. The sheet in our apps surface names the ask, in Arabic, before the document leaves —
   from the catalogue row's `requestedScopes`, not from a live probe, so it costs no round trip and
   cannot fail while the member is deciding.

## Consequences

- One tool is knowingly left out on Supabase: `get_publishable_keys` asks for `secrets:read`,
  refuses with that name, and the wider consent grants a scope whose name is broader than the tool.
  Excluding it is the safer default; the refusal is honest and one tap away from being fixed.
- A provider whose grant is bound to the client accumulates registrations in its console each time
  we change a row's set. They are inert, but they are litter, and the table records when each set
  was read so a person can see why a new one exists.
- The spec's provider table gains a column for the set each row asks for; ADR-0163's "the DCR path
  asks for no scope on purpose" no longer holds and is superseded here, while its pre-registered
  client decision — a reviewed entry names its scopes — stands unchanged.
- A connection made before this change keeps its wide grant until the member re-consents; the row
  shows the grant it actually holds rather than the one we would now ask for.
