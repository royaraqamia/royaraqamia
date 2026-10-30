# A port draws the site's glyphs, its fluid steps, and its motion

Two questions were still open when the card's geometry became a recipe, and both decide whether a
ported screen is _the same design_ or merely a similar one.

**Glyphs.** The card drew its padlock by hand and its retry had no icon, because the app carries no icon
library and the nearest Material glyph is a different drawing. An icon is design: the stroke, the
openness of the shackle and the corner of the body are what a member recognises.

**Responsive steps.** The site mixes two scales: `--type-*` fluid tokens, and Tailwind's breakpoint
utilities (`text-sm sm:text-base`). The app resolves one fluid value per window, so a `sm:` class has no
native twin — the plan card's rows were 12px up to 640px and 14px above it, while the app's token gave
12–14px to every width.

## The decision

- **Icons come from the site's own source.** `shared/icons/icons.json` lists the glyphs a ported
  component draws; `npm run vectors:generate` reads each one's lucide module — the same file the site
  imports — converts every SVG primitive to path data, and emits a Compose `ImageVector` with the site's
  stroke width, round caps and round joins. `npm run check:vectors` fails a stale output, and
  `npm run check:parity` fails a component that imports an icon the manifest does not list, draws one
  the site does not, or names a vector that was never generated. A glyph is tinted by `Icon`, exactly
  as `currentColor` tints it on the site.
- **A ported component uses the fluid token steps, never a breakpoint utility.** No `sm:`, `md:` or
  `lg:` in the component a port mirrors: the recipe names the step (`xs`, `small`, `body`), and both
  clients resolve it from the same `clamp()`. A component that genuinely needs a different layout above
  a breakpoint is a recipe gap, and the recipe grows a rule for it — the app is not asked to guess.
- **Design motion comes from the recipe; platform feedback stays the platform's.** A designed animation
  — the skeleton's 2000ms pulse from 1 to 0.5 — is a recipe value both clients read. Ripple, press
  elevation, overscroll glow and the keyboard are the OS, are not design, and are not imitated.

## Considered options

- **Add an icon dependency to the app** (`material-icons-extended`, or a lucide Compose port). A
  megabyte of glyphs for two icons, and still not the site's drawings: a lucide shape re-exported by a
  third party is a copy with its own version.
- **Keep hand-drawn glyphs.** Two drawings of one icon, maintained separately, with no test that could
  say which is right — the arrangement that produced the padlock.
- **Emulate the web's breakpoints in the app** (a 640dp step in `royTypeScale`). It would make the
  ported card _depend_ on Tailwind defaults the design never chose; the fluid tokens are the site's own
  scale, and the card should step with them at every width.
- **Animate Material's defaults into the site's curves.** Press feedback a hundred milliseconds off
  feels broken on the device and is invisible on the site; the two are different jobs.

## Consequences

- **The plan card draws `LucideVectors.Lock` and `LucideVectors.RotateCw`**, sized by
  `Recipes.Glyph.md`/`sm` — the site's `size={24}` and `size-4`, from one value.
- **`plan-view.tsx` no longer passes icon sizes by hand** (`roy-glyph--md`/`--sm`), and carries no
  responsive typography: its text is the token step, so a tablet reads the same scale on both clients.
- **The app gains a generated `ui/vectors` package**; a new glyph is a line in `shared/icons/icons.json`
  plus `npm run vectors:generate`.
- **The exception list is now explicit**: platform furniture (status bar, keyboard, scroll physics,
  ripple, selection) may differ; nothing in the design may.
