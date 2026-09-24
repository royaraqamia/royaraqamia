# The site renders one flat path for every device; per-frame effects are removed globally

We want the site to feel instant and smooth on every modern device. The effects that cost us
most — `backdrop-filter` glass, glow blur, always-on animations, 3D transforms and
`transition-all` — are charged to the compositor on _every_ frame, on every device, not only
slow ones. We previously hedged with **lite mode** (`frontend/shared/lite-mode.ts`), a
pre-paint check that stripped the heaviest effects when `deviceMemory <= 4` or
`hardwareConcurrency <= 4`. That hedge cannot deliver the goal: `deviceMemory` does not exist
in Safari or Firefox, and the check deliberately **fails open** to full effects when signals
are absent (`docs/performance.md`), so "every device" was never actually covered.

We decided to remove per-frame effects for everyone and keep only static depth cues (shadows,
gradients), whose cost is paid once when they are first rastered. Lite mode and its capability
detection are deleted; the cheap path is the default and depends on no capability API.

The line is drawn by a rule: **if a non-per-frame alternative delivers the same function, the
effect is decorative and is removed.** A navbar's backdrop blur is decorative — an opaque fill
preserves legibility just as well. A loading shimmer or a dialog's enter/exit is functional —
it is already transform/opacity based and stays.

## Considered Options

- **Keep lite mode and extend it to cover `transition-all` and motion.** Rejected: still
  non-uniform (capable devices keep paying the cost) and still fails open where detection APIs
  are missing, so it cannot meet "every device".
- **Keep effects on capable devices, strip only on the low end.** Rejected: the goal is the
  same instant feel everywhere; a desktop user should not get a heavier site than a phone.
- **Remove all decoration, including static shadows and gradients.** Rejected: static styles
  are a one-time raster and cost nothing per frame, so removing them buys no runtime win while
  erasing the visual identity.

## Consequences

- The glass/glow signature is gone for desktop users too, not only phones. This is the
  accepted cost of uniformity.
- `perf:check` guards transferred bytes only (`docs/performance.md`), so it can neither see
  this win nor catch its regression. The runtime budget that does is tracked separately.
- A regression guard (lint/CI) must ban the removed utilities — `backdrop-blur-*`,
  `transition-all` and the glow utilities — or the flattening will leak back within a few PRs.
