# A UI component is not a route's private file

#1516 found `PostList` in `app/account/posts/_components/`, imported by
`frontend/ui/account/account-posts-view.tsx`. Nothing broke, and that is what
made it last: the component worked, the page drew it, and the test passed. What
it cost was the next surface. A component under a route's `_components/` is
reachable only through the route that happened to want it first, so a plan-gated
posts view or a second account layout had two options — import across the same
boundary again, or copy the list.

The same shape held twice more in the community surface: `PostComposerDialog`
was imported by the account view, and `community-screen-scope.ts` by the
snapshot fixture in `frontend/ui/__tests__/`. Both are the client layer reaching
up into a route, which is the direction `docs/architecture.md` draws the other
way.

## The decision

1. **A `_components/` folder is private to the route that owns it.** It holds
   what only that route draws: its page-level pieces, its copy sources, its
   reducers.

2. **A component two callers want lives in `frontend/ui/<product>/`.** Not
   `_components/`, not a second copy. `PostList` became
   `frontend/ui/account/post-list.tsx` beside its only caller; the composer, its
   two generated copy modules and the community scope module became
   `frontend/ui/community/`.

3. **The direction is a lint error, not a review note.** `layers/no-cross-layer-import`
   (`eslint-rules/layering.mjs`) gains a fifth zone: `frontend/**` may not import
   `app/**/_components/**`, by alias or by a relative walk. It is the same rule
   that already refuses `backend/**` → `frontend/**` and a Supabase client in a
   component, so a new crossing fails `npm run lint` before it reaches review.

4. **The gate carries no exemption list.** The two community files moved in the
   same change that added the zone, so the rule is true of the whole tree from
   the commit that introduces it. A rule with a standing allowlist is a rule
   nobody reads again.

## Consequences

- **`check:layers` is not this gate.** It compiles the shell and every surface
  stylesheet and rules on a base utility paired with a breakpoint variant
  (ADR-0132); extending it with an import rule would have put two unrelated
  boundaries behind one name. The import direction belongs to the ESLint layer
  rule that already exists.
- **`shared/copy/community-editor.json` and `community-composer.json` move their
  `web.file`**, and `docs/mobile/parity.json` follows the new paths: a component
  that moves is still the same pair, and `check:copy` and `check:parity` read the
  path it is written at.
- **`app/account/posts/page.tsx` is unchanged.** It was already the data-free
  shell; the move only shortened what the view imports.
- **Nothing renders differently.** No markup, class, string or state changed —
  the diff is file moves, import lines, a lint zone and this record.
