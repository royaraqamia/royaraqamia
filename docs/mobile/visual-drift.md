# Visual drift

The visual gate records what a surface looked like on both clients at one point in time (ADR-0118). `npm run check:visual` compares the app's current capture with that recording; it cannot see the web change afterwards. That is how a surface can stay green while the page it is meant to match has moved on (#1564, #1565, #1567 and #1574).

`npm run check:visual-drift -- --base <ref>` closes the gap for a pull request. If a changed file draws a gated native surface on the web — its component, route, copy module, shared copy source or visual contract — the pull request must also change that surface's evidence under `e2e/__visual__/<surface>/`, or carry a dated waiver. The check is scoped to the pull request's own diff, so the existing backlog of stale surfaces does not make every unrelated pull request fail.

## Re-record, don't waive

The normal response is to re-record both sides: `npm run visual:capture` for the page and the surface's app visual test with `-Proborazzi.record=true`, then update `docs/mobile/visual-gate.json` with the new `baseline.recorded`, `measured` and alignment. Do not widen a tolerance to absorb a change; report it instead.

## When a waiver is legitimate

A waiver is for a web change that provably cannot alter the capture — a refactor with no layout, copy or state change. It is not for a redesign, and not for a backlog the team has not got to yet. Add a row to `docs/mobile/visual-waivers.json`:

```json
{
  "surface": "example",
  "reason": "Why the rendered output is unchanged",
  "issue": "#1234",
  "until": "2026-12-31"
}
```

The reason, issue and expiry are all required. An expired or malformed waiver fails the check, so a temporary exception cannot become permanent by neglect.

## The backlog

Surfaces whose evidence already predates a web change are listed in #1631. A new pull request that touches one of them still has to re-record it; the backlog is not a blanket exemption.
