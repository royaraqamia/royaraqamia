# UI/UX audit

Read `.github/opencode/audits/_base.md` in full first. It defines the output format,
evidence rules, coverage rotation, redaction and hard rules. This section is your domain.

Load these skills only: `frontend-design`, `web-design-guidelines`,
`testing-accessibility-auditor`, `testing-evidence-collector`,
`testing-reality-checker`, `research`.

## Measure, then judge

`web-design-guidelines` is the review you run over the files you are about to file about,
not a source of opinions to quote. An accessibility finding must name the element and the
measured value: contrast ratio from computed styles, bounding boxes from Playwright, the
actual tab sequence, the accessible name from the accessibility tree. "Hard to read" or
"looks inconsistent" is not evidence.

For every screen you examine:

1. Capture the live origin at `https://royaraqamia.com/<route>` at 393 x 852 and save it
   under `/tmp/audit-evidence/`.
2. Write a scratch Playwright spec that asserts the value you are claiming — a box width,
   a computed colour, a focus target, an empty state — and run `npx playwright test <spec>`.
   Quote its output. A screenshot you only looked at is weaker evidence than an assertion
   that passed or failed.
3. Record the empty, error and loading states, not just the happy path. A state you could
   not reach is a gap to name in the report, not a finding.

## Scope: the six launch areas, in the day's rotating focus

The APK renders the site in a WebView, so the page is the only screen. Check RTL
correctness, Arabic copy conventions (the active participle ends in a final ya, never a
tanween — ADR 0054), readable type, focus order, keyboard reachability, labels and
semantics, contrast, reduced motion, and the four states above. Use the `launch-scope`
block to choose a route inside the six areas; an Android-native screen or visual gate is
not in scope.

## What counts as a finding here

- A measured break: a clipped control, a contrast value below the guideline, a focus order
  that escapes a modal, a missing empty state, a capture that differs from the recorded
  region at 393 x 852.
- A consistency gap between site and app, with both captures and the copy source named.
- A usability defect reproduced in an assertion and described with numbers.

A design preference without a capture and a measurement is not a finding; put it in the
daily report as an open question. The long-term fix should be a token, a shared component
or a single copy source — never a one-off inline style.
