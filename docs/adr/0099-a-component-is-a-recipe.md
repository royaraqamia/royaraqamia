# A shared component is a recipe, generated into both clients

ADR-0098 made a port a pair: one route, one copy source, one state list, checked. It did not make the
_drawing_ the same — and the plan card showed it a second time. Its corners were 8dp against the site's
16, its skeleton blocks and the gap between two rows were numbers typed in Compose that had a Tailwind
twin nobody compared, and its badge alphas were three literals on one side and three utilities on the
other. The pair check could prove the two clients said the same words about the same states while
drawing different boxes.

Tokens were not enough and could not be: `tokens.json` holds values, and a component is a _composition_
of them — which radius, which padding, which gap, which alpha on which surface. The site expressed that
composition as Tailwind classes in a component file; the app expressed it as Compose arguments in
another file. Two transcriptions of one design.

## The decision

`shared/components/recipes.json` describes the primitives a ported component is made of — a card, a
badge, a skeleton, a row — in token names, not numbers:

- **One source, two emitters.** `npm run components:generate` writes `app/components.css` (the site's
  class per primitive, built from the token custom properties) and `Recipes.kt` (the same primitives in
  the types Compose draws with). `npm run check:components` fails a stale output, in CI beside the
  contract and token checks.
- **The web reads the generated class, not a utility.** `.roy-card`, `.roy-rows`, `.roy-row`,
  `.roy-row-label`, `.roy-row-value`, `.roy-skeleton` — so the site's card cannot drift from the app's
  by someone editing a class list.
- **The app reads the generated accessor, not a literal.** `Recipes.Card.radius`, `.padding(spacing)`,
  `.gap(spacing)`, `.container`, `.border`; `Recipes.Skeleton.blocks`, `.pulseMs`; `Recipes.Row.value(type)`.
  A screen that types `16.dp` for a card corner again is the thing this prevents.
- **A name that is not a token is refused at generation**, not rendered as nothing: a typo in a spacing
  or colour name fails the run.
- **Fluid values stay functions.** Padding and gap are `clamp()` on the web and a function of the
  resolved `RoySpacing` in the app, so a tablet resolves both sides from the same rule instead of one
  client picking a number.
- **`RoyShape` names shapes by what they are** — `card`, `pill` — and the recipe may only use those. The
  generator refuses a Material step by number, which is how the card got 8dp in the first place.

## Considered options

- **Generate the Compose component from the web component.** Two implementations of one design, not one
  component tree (ADR-0089); a generator would have to encode every web primitive, and the first
  divergence would be a generator bug.
- **Keep the web on utilities and mirror them in the app by hand.** That is the arrangement that
  produced both drift reports. A class string is not reviewable against a Compose argument.
- **One CSS file per primitive, generated.** More files than the surface-splitting rule needs: the
  primitives are small, always drawn together, and the shell already loads one stylesheet.
- **A runtime theme loader in the app.** The app has no network dependency for its own chrome, and a
  recipe is a build-time fact.

## Consequences

- **`app/components.css` is generated and imported by the shell** (`app/global.css`). A primitive's
  values are the recipe's; a surface stylesheet that re-declares one is the drift `check:components`
  and `check:tokens` exist to catch.
- **The plan card stopped typing numbers**: its card, skeleton and rows read the recipe, and the wording
  of its doc comment is now true by construction rather than by care.
- **The badge is only half done.** Its geometry is still in `badge.tsx` because the primitive has
  variants the port does not draw (destructive, outline, warning, info, glow) and those still carry
  Tailwind palette classes. The recipe's `badge` section exists for the two tones the card uses and the
  rest follows when those variants are tokenised — a listed gap, not a covered one.
- **Icons, shadows and the sign-in action remain outside this**, as ADR-0098 listed them: generating
  Compose vectors from the site's SVGs, and a screenshot diff of the same component rendered by both
  clients, are the next steps.
