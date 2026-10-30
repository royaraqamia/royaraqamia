# A ported component is a pair: one route, one copy source, one state list

The app's first Compose card was a port of the section `/account/plan` opens with, and it looked like
one: the same title, the same rows, the same badge. It was also, measurably, not the same component.
The site draws 16px corners and the app drew 8dp; the site's badge is a green pill on a paid plan and
the app's was a grey rounded rectangle; the site lists the owned-item caps beside the counted actions
and the app listed only the counters, because it read `/api/me/usage` while the page reads
`/api/me/plan`; the expiry line was missing; the guest prompt had a title, a body and no way in; and
the loading state was a spinner where the page pulses two skeleton blocks.

None of that was a bug in either client. `docs/mobile/two-clients.md` was honest about the cause — "the
one thing the four rules cannot do is decide for you" — and listed visual drift as a human review item.
Review had looked at both files and approved them, because there was nothing to hold one against the
other.

## The decision

A port is a **pair**, and the pair is data:

- **One row per ported component** in `docs/mobile/parity.json`: the web route and component, the
  Kotlin component, the Kotlin state file, the copy source, and the states the component draws.
- **One route per surface.** The plan card reads `/api/me/plan`, the body the page reads, cleared
  through `MyPlanResponseSchema` — a schema that had not existed, which is why the app had been given
  the narrower route. A client that assembles its own subset of a surface's data will always show
  less than the design; the contract is where "which rows exist" is decided.
- **One copy source per ported surface** (`shared/copy/*.json`), generated into the site's module and
  the app's object by `npm run copy:generate`. Neither client spells a user-facing string. Arabic
  writes a word's marks in more than one order and the two compare unequal while rendering the same, so
  "copied byte for byte, and a copy change on the site is a change here" was a comment that could only
  hold until the first person retyped it — as the first draft of this change demonstrated by getting
  two labels wrong while moving them.
- **One state list.** The app's sealed interface is parsed, and its cases must equal the row's states.
- **`npm run check:parity`** fails when a file is missing, a state exists on one side only, a state's
  string is not rendered by both, a copy key is rendered by neither, or a copy source belongs to no
  row. `npm run check:copy` fails a stale output.
- **The site is the reference.** A copy key the web component does not render fails the check, even if
  the app renders it: the app is measured against the site, never the reverse.

The radius gap is closed at the token layer rather than per component. `rounded-2xl` had never been a
token — `app/theme.css` stopped its ladder at `xl` — so the site was drawing Tailwind's 1rem default
and the app had no value to match. `--radius-2xl` (`--radius` + 8px) now exists, the app derives its
card corner from the same token, and the surfaces that ask for a card corner use `card-padding` rather
than a hand-picked `p-4 sm:p-5`, so density is the token too.

Two values that no token held are still held to the site: the surface alphas (`bg-card/60`,
`border-border/50`) and the badge tones are reproduced in the app from `RoyColors`, and the date is
pinned by a fixture both suites read (`shared/fixtures/parity/hijri-dates.json`), because the site
formats it with `Intl` and the app with Android's Umm al-Qura calendar.

## Considered options

- **Screenshot diffing across the two clients.** It would cover everything this does not — spacing,
  weight, order — but it needs a device in CI, a stable rendering stack and a tolerance policy, and it
  still cannot say _which_ of the two moved or that a string is missing from one of them. The value
  baseline (`ADR-0096`) is the web's half; this is the structure's.
- **Generate the Compose card from the web component.** The clients are two implementations of one
  design, not one component tree (`ADR-0089`); a generator that emitted Compose would have to encode
  every web primitive anyway, and the first divergence would be a generator bug rather than a review.
- **Keep the app on `/api/me/usage` and add the caps to it.** Two bodies that both half-describe the
  page; the next field lands on one of them. One surface, one route.
- **Move the copy into a translation file keyed by message id.** The site's strings are not translated
  — there is one Arabic voice — and an id layer would hide the sentence from the reviewer reading the
  component.

## Consequences

- **The plan card draws the page**: caps, expiry, the guest's way in, the site's skeleton, the pill
  badge with its success tone, the same corners and alphas. The one deliberate difference is the
  sign-in action's skin — the site's gradient hero pill is a web component with no native twin.
- **`UsageUiState.Failed` carries no message** any more: the words are the generated constant, so the
  check can prove the card renders the site's sentence.
- **The card's model is `rows`**, one list built the way the page builds it (`ADR-0093`), so the
  ordering rule lives in one place per client instead of in the view.
- **A new ported component owes a row, a copy source and a state file**, and `check:parity` fails until
  it has all three. A `shared/copy/*.json` nobody claims fails too, so copy cannot arrive ahead of the
  component that draws it.
- **The app grows a date formatter** (`PlanDates`), pinned by the shared fixture, and the web suite
  asserts the same fixture — either platform drifting turns one of the two red.
