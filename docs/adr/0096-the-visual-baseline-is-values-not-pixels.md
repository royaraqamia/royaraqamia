# The visual baseline is values, not pixels

[ADR-0089](0089-the-android-app-is-native.md) made one token file the source both clients are drawn
from, and #693/#695 landed the generator: `shared/tokens/tokens.json` emits the site's
`app/tokens.css`, the shell's `res/values/colors.xml`, and the app's `DesignTokens.kt` and
`ThemeColors.kt`. Every output is committed and `npm run check:tokens` fails a stale one, so the
generator cannot drift from its own output.

What that gate cannot see is the transcription. A `clamp()` written one stop off, an HSL triplet with
its lightness and saturation transposed, a `--font-digits` whose `unicode-range` stopped catching the
numerals: each leaves the stylesheet byte-identical to what the generator produces, and each changes
what a reader sees. #666's last acceptance criterion asks for exactly that proof — at least one
surface renders identically before and after the migration — and calls it a visual baseline.

## The decision

The baseline is a record of the values the browser resolved, committed as
`e2e/visual-baseline.json` and compared by `e2e/visual-baseline.spec.ts`.

- **Every generated custom property**, read back through a probe element at one viewport: a fluid
  `clamp()` as the pixel it resolves to, HSL components as the `rgb()` their consumer composes, a
  `rem` radius as pixels, a font variable as the family string, a shadow as the painted value. The
  list of properties is parsed out of the committed `app/tokens.css`, so a token is covered the
  moment it is generated — and a token whose shape matches no probe fails the spec rather than being
  quietly skipped.
- **One real surface wearing them.** `/quran` is static, public, needs no account or database, and is
  drawn from the tokens throughout: the four-step surface ladder and the radii on the rows, the
  heading face on the numerals, the digits face on everything else. The spec reads the computed
  styles of a fixed set of elements on it, and a selector the surface no longer has fails rather than
  passing on an empty record.
- **The digits face's range**, which no computed style reports: the spec asserts the body stack
  starts with it, that its `unicode-range` is `U+30-39`, and that it was actually fetched because
  digits on the page used it.

## Considered options

- **Pixel screenshots (`toHaveScreenshot`).** The obvious reading of "visual baseline", and it catches
  what a value baseline cannot — layout, stacking, gradients. Rejected because Playwright keys
  snapshots by platform: a baseline can only be compared where it was recorded, so the file has to be
  recorded on the Linux runner, and every intended visual change becomes push, wait for a build,
  download the artifact, commit, push. `--update-snapshots` on a developer's Windows machine writes a
  `-win32` baseline nothing reads. A gate whose re-record needs a CI round trip is one that gets
  skipped, and one that gets skipped gets rubber-stamped. Text rasterisation also differs per platform
  (DirectWrite against FreeType), so the picture is not a portable artefact either way.
- **Record only the surface, not the tokens.** Simpler, and it is what the issue asks for. Rejected
  because the interesting failure is a token that resolves wrongly, and an element can look plausible
  while the step behind it is wrong — the probe makes the resolution itself the assertion.
- **A unit test over the generated CSS.** Cheapest, and it would catch a stale file — which
  `check:tokens` already does. It cannot answer what the browser does with the value, which is the
  only question left.

## Consequences

- **A token change that changes rendering fails a pull request** (`.github/workflows/visual-baseline.yml`,
  path-filtered to the token files, the stylesheets that consume them and the surface itself), and the
  failure is a one-line diff naming the property — not a picture to squint at.
- **Re-recording is local:** `npm run visual:baseline` (Playwright starts the dev server) rewrites the
  file, and its diff is the review. It runs anywhere, on any OS.
- **The viewport is part of the baseline**, fixed at 1280x720 by the spec rather than inherited from a
  Playwright project, so the fluid steps resolve to the same pixels everywhere. A second viewport is a
  second recorded size, not a tolerance.
- **It pins one surface.** A component that changes the sura index re-records the baseline; a change
  to another surface is not covered, and a third client is not covered until a second surface is
  added. It proves values, not layout: positions, paint order and images are out of scope by
  construction.
- **Reading values is not platform-specific, but dev is not prod.** The spec compares inside whatever
  server Playwright runs, which is the production build in CI and `next dev` locally; a value that
  only differs between the two would surface as a red check on the pull request, which is what the
  gate is for.
