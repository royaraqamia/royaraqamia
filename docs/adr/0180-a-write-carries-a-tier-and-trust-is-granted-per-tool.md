# 0180. A write carries a tier, and trust is granted per tool

## Status

Accepted (program). The registry that carries the tier lands in phase 0; the grants land in
phase 3.

## Context

ADR-0113 settled the shape of a write: the assistant proposes it as a card, and the member's own
request runs it as themselves. The implementation reduced that to a boolean — a tool is `read`
and runs inside the turn, or it is `write` and never runs there.

That boolean has two problems.

**It is the wrong axis.** Recording an expense and publishing an article are both writes. The
first is reversible, private, and costs the member one tap to undo; the second is public, may
notify readers, and cannot be taken back. Treating them alike either makes the safe one
annoying or the dangerous one too easy.

**It does not survive contact with real use.** A member who confirms "record expense" forty
times learns to tap the button without reading it. Friction that never varies stops being a
check and becomes a reflex. Every mature product that has crossed this bridge — the per-tool
prompt with "allow once / always allow", the command allowlist, the action card on a connector
write — arrives at the same answer: keep the boundary, and let the member move it _one tool at
a time_.

The external apps already have a partial version of this: `McpPermissionLevel` is `reads`,
`ask` or `all`. `all` is a blanket over a whole app, which is the one shape the mature products
never chose, because an app is a vendor's boundary and not the member's blast radius.

## Decision

**A tool declares its tier; the member may grant trust to a tier-1 tool, and to nothing else.**

1. **Four tiers**, declared on the registry entry (ADR-0183), never inferred from a name:

   | Tier | Meaning                                  | Behaviour                                                    |
   | ---- | ---------------------------------------- | ------------------------------------------------------------ |
   | 0    | read                                     | runs inside the turn                                         |
   | 1    | reversible, own data, no third party     | runs inside the turn **only** with a grant; otherwise a card |
   | 2    | a third party can see it, or money moves | always a card                                                |
   | 3    | destructive or irreversible              | a card, and the confirm names the target                     |

   Examples: `get_expenses_summary` is 0; `record_expense` and `create_habit` are 1;
   `publish_post_draft`, `book_consultation`, `send_message` and any external app's unannotated
   tool are 2; `delete_post`, `revoke_app`, `cancel_booking` and `delete_account` are 3.

2. **Trust is a row, not a flag.** `agent_tool_grants(user_id, tool_id, granted_at, granted_from,
last_used_at, revoked_at)`, unique on the live pair. A grant is created only by the member's
   own request after they have seen the tool run at least once, and it is revocable from the
   assistant settings and from the apps sheet.

3. **The executor is shared.** A granted tool is invoked by the turn, but through the same
   executor the confirm path uses, so the audit row (`chat_agent_actions` today) is written
   either way. There is still exactly one writer of a tier-1..3 effect.

4. **Tier 2 is not grantable.** No amount of confirmation turns a publish into an automatic
   action. The only knob above tier 1 is the confirm itself.

5. **Tier 3 asks for the target.** The card names what will happen and requires typing the
   target's name, or `احذف`, before the button enables. A single tap can never destroy.

6. **`reads` stays a hard narrowing; `all` stops meaning everything.** For an external app,
   `reads` refuses every non-read-only tool regardless of grants. `all` becomes "this app's
   tier 0 and tier 1 tools"; its tier 2 and 3 tools still card. The column stays, its meaning
   narrows. A grant on a third-party tool is per tool, like our own.

7. **A missing tier fails the build.** There is no default, because a default is how a new tool
   quietly becomes automatic.

8. **An unattended run's ceiling is tier 1** (ADR-0184). A run may not create a grant, widen a
   level, or reach tier 2.

9. **The model never decides whether to ask.** It declares the call; the executor decides what
   happens to it from the entry's tier and the member's grants. A prompt line that says "ask
   before writing" is a second defence, not the defence.

## Considered options

- **Confirm everything, forever.** Rejected: it produces blind confirmation, and it punishes the
  member for trusting the product.
- **Auto-run every write with an undo window.** Rejected for tiers 2 and 3: an undo cannot
  un-send a message, un-publish a post, or un-take a slot. For tier 1 it is unnecessary — a
  grant already gives that speed, with a record.
- **Trust the whole app.** Rejected: the vendor's boundary is not the member's blast radius, and
  one app can carry a read and a delete.
- **Let the model ask when it thinks it should.** Rejected: the model is the thing being
  trusted. The check has to live where the call happens.
- **Keep the boolean and add a confirmation on the dangerous ones.** Rejected: that is this
  decision, spelled worse — the tier is the boolean replaced.

## Consequences

- `chat_agent_actions` gains `tier` and `grant_id`, so the audit says _why_ something ran without
  a tap.
- Every registry entry needs a tier, and `npm run check:tools` fails without one.
- The first-run experience stays exactly as it is today: nothing is granted, everything cards.
  The speed arrives one tool at a time, at the member's pace.
- `McpPermissionLevel` keeps three values but `all` is reinterpreted; the app's own copy has to
  say what it now means, in both clients.
- The apps sheet and the assistant settings draw the same grants. Two surfaces, one list.
- Tests: a tier-2 tool cannot run from a turn even with a grant; a tier-3 confirm without the
  typed target is refused server-side, not only in the UI.
