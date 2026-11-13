# 0181. The eyes are the screen's own state

## Status

Accepted (program). Web lands in phase 1, the Android pair immediately after.

## Context

The panel opens over whatever the member was reading (ADR-0143), and knows nothing about it. Ask
«نور» "what is wrong with this form" and it has to ask which form. That is the single largest
gap between this assistant and the ones it is measured against, and it cannot be closed by tools:
a tool the model has to think of calling is not eyes.

Three ways to give it eyes, and two of them are wrong here.

- **The route.** `/spendtrack` tells the agent the product name and nothing else. It cannot see
  the sheet that is open, the record being edited, or the field that failed validation.
- **The DOM.** It reads portals, misses nothing in principle, and will eventually read a password
  field, an OTP, or a token in a hidden input. It also breaks on every refactor that changes a
  class name, and its size is unbounded. Rejected.
- **A screenshot.** Slower, costs a vision call per turn, and captures strictly more than the
  question needs. Rejected.

The app already has the thing that makes the third option work: a registry of surfaces
(`docs/mobile/screens.json`, 39 rows) and a parity contract that already says a surface exists
twice or says why not (ADR-0098, ADR-0117). The eyes should be that registry, published.

## Decision

**The assistant sees a structured snapshot of the screen's own state, published by the surface
itself, redacted structurally, and never persisted.**

1. **One type, one place.** `shared/contracts/screen-context.ts` defines:

   ```ts
   interface ScreenContext {
     route: string; // /spendtrack/expenses
     product: string; // spendtrack
     screenId: string; // spendtrack.expenses.list
     title: string; // the screen's own title, as drawn
     overlays: Array<{ id: string; kind: string }>; // open sheets and dialogs
     focus: { kind: string; id: string } | null; // the record in hand
     tab: string | null; // the selected tab or chip
     fields: Record<string, string>; // allowlisted only
     text: string; // a capped excerpt of what is on screen
     updatedAt: string;
   }
   ```

2. **Two publishers, not a scraper.** A route provider publishes route, product, screen id and
   title. An overlay registry publishes what is open above it. A surface that registers nothing
   is still visible by route — it is never invisible.

3. **Settle, then send.** The snapshot is debounced on settle (250–400 ms), compressed to a
   token cap (~600 tokens), and attached to the next turn as a system block. It is not streamed
   on every keystroke and it is not a tool call, so the model does not spend a round discovering
   where it is.

4. **Redaction is structural.** A denylist of field names and input types (password, OTP,
   payment, token) is applied at the source, and a per-surface allowlist decides which fields are
   readable at all. Private message bodies, draft text the member has not sent, and anything
   inside an auth surface are excluded by default rather than by a rule someone has to remember.

5. **Session-scoped, never stored.** The snapshot lives in the client's session and in the turn's
   memory. It is not written to a table, not logged, and not kept after the turn. A member can
   switch eyes off, and a surface can opt out; when it does, the assistant says it cannot see
   that screen instead of guessing.

6. **The native client publishes the same snapshot.** The Compose shell registers the same screen
   ids, and the pair is listed in `docs/mobile/parity.json`. The visual gate is unchanged: this
   decision adds no pixels.

7. **A refresh tool, not a replacement.** `get_screen_context` exists only for the case where the
   snapshot in the turn is older than the member's question. The normal path is the system block.

8. **An admin surface is not an observed surface.** While a route under `/admin`, or an admin
   dialog, is open, no snapshot is published at all — no fields, no text, no focus — and the turn
   says it cannot see the screen. The eyes exist to help a member with their own data; carrying
   another member's row into a prompt because an operator happened to be looking at it is the one
   failure this contract cannot recover from.

## Considered options

- **DOM capture.** Rejected: brittle, unbounded, and it captures secrets the member never agreed
  to show.
- **The accessibility tree.** Better than raw DOM, still unbounded, still a scrape, and the panel
  would be reading a rendering of the page rather than the page's model.
- **Screenshots per turn.** Rejected: cost, latency, and a much larger privacy surface for a
  question the state already answers.
- **Route only.** Rejected: it cannot answer "this dialog" or "this record", which is the whole
  request.
- **Persisting the snapshot for later turns.** Rejected: a page the member left is not context,
  it is a record of where they have been.

## Consequences

- Every surface registers its screen id, title and readable fields. A route with no registration
  reports route only, and `npm run check:screens` grows a rule that names it.
- A new surface in `docs/mobile/screens.json` without a snapshot registration is a visible gap,
  not a silent one.
- The turn's context grows by a bounded block; the token budget pays for it by trimming history,
  and the summary (ADR-0182) carries what the trim drops.
- `security-review` is mandatory on the change that first reads the page, and on any surface that
  adds a readable field.
- Tests: a form with a password field, an OTP field and a payment field produces a snapshot
  containing none of them; a surface that opts out produces no `fields` and no `text`.
