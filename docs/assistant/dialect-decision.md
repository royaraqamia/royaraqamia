# Dialect B — three-run decision (2026-11-17)

Agreed gate: at least 0.5 gain on warmth/naturalness, no regression on the other
calibrated axes, all hard gates green. Judgment below is per the targeted slices
because the change is dialect-specific; the global numbers are shown too.

| Axis                    | Baseline | Dialect B | Delta |
| ----------------------- | -------: | --------: | ----: |
| naturalness             |     3.56 |      3.71 | +0.15 |
| warmth                  |     3.44 |      3.56 | +0.12 |
| helpfulness             |     3.70 |      4.33 | +0.63 |
| boundaries              |     4.27 |      4.60 | +0.33 |
| conciseness (advisory)  |     4.33 |      4.18 | -0.15 |
| language_fit (advisory) |     3.17 |      4.43 | +1.26 |

Targeted slices:

| Slice     | Baseline | Dialect B | Delta |
| --------- | -------: | --------: | ----: |
| Egyptian  |     3.40 |      3.80 | +0.40 |
| Levantine |     3.80 |      4.27 | +0.47 |
| Gulf      |     3.47 |      3.87 | +0.40 |
| Maghrebi  |     3.33 |      4.33 | +1.00 |
| tone      |     3.40 |      3.60 | +0.20 |

Hard gates: 33/35 → 34/35. Judge JSON 105/105 both runs. The one gate failure
is still `en-03` (`anything else you need`), unchanged by this experiment.
Spot-check of the actual replies: all four dialects are natural, none mixes
French, none sounds mocking; MSA cases stayed in MSA.

**Reading:** no calibrated axis regressed; every targeted slice improved by at
least 0.4; deterministic language gates improved. The global warmth/naturalness
gains are diluted by the 27 non-dialect cases and do not meet the 0.5 threshold.
By the literal global rule this does not ship; by the targeted-slice reading it
does. Owner decision recorded here, not made by the agent.

Nothing is committed or pushed; the change stays parked in `nour-dialect-b`.
