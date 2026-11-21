# Structured voice prototype — decision (2026-11-21)

Verdict: the response-contract prototype is built and measured, but **it does not
clear the gate in issue #1721 and is not wired into production**. The shipped
prompt and the streaming turn are unchanged.

## What was built

- `shared/contracts/nour-voice.mjs` - deterministic intent selection (thanks,
  ambiguous, boundary, affective, greeting, factual), a stable policy prompt, an
  intent-keyed exemplar pool that sends at most two examples per turn, and a
  renderer that parses the `acknowledgment` / `answer` / `next_step` envelope,
  normalises digits to ASCII and drops closing offers in code.
- `scripts/nour-evals/run-structured-layer.mjs` - measures the prototype on the
  same 35 model-layer cases with `--runs 3`, and records generator latency,
  token usage and gateway cost on every reply.
- `scripts/nour-evals/check-voice-gate.mjs` - the gate from the issue: warmth on
  earned slices, global naturalness, no regression on helpfulness or boundaries,
  35/35 hard gates.
- Seven unit tests for intent selection, prompt size, the retained hard-gate
  policy lines, rendering and the plain-text fallback.

## Three-run comparison

| Measure                | Shipped prompt |                  Prototype | Delta |
| ---------------------- | -------------: | -------------------------: | ----: |
| naturalness (global)   |           3.78 |                       3.83 | +0.05 |
| warmth (earned slices) |           3.71 |                       3.95 | +0.24 |
| helpfulness (global)   |           4.32 |                       4.44 | +0.12 |
| boundaries (global)    |           4.73 |                       4.53 | -0.20 |
| hard gates             |          35/35 |                      35/35 |     0 |
| prompt characters      |           3010 |                       2911 |   -99 |
| envelope parsed        |            n/a |                    105/105 |     - |
| generator latency      |   not recorded | 4128 ms mean / 6993 ms p95 |     - |
| tokens per reply       |   not recorded |          1190 in / 213 out |     - |
| gateway cost per reply |   not recorded |                 0.00015249 |     - |

The full scorecard is `eval-report-structured.json` in this folder.

## Reading

The architecture works mechanically: every envelope parsed, the prompt is
shorter than the shipped one despite the extra structure, the hard gates held,
and warmth on the slices where it is earned improved more than in any prompt
variant from #1606. But the two target gains are far short of +0.5, and
boundaries regressed by 0.20. The boundary replies are longer and more hedged
than the shipped ones, and the renderer can only remove an offer after the
model has already written it.

This confirms the finding from #1606: a global naturalness gain of +0.5 is not
reachable by changing what the model is told or how its answer is shaped. The
judge scores a neutral factual answer 3 on warmth by design, and those cases
make up most of the suite. Continuing to tune exemplars would be noise-chasing.

## Recommendation

Keep the shipped prompt. The prototype is worth keeping as the measurement and
implementation base, but it should not be switched on until the gate is revised
against what the judge can actually measure: slice-level naturalness and warmth,
the code-enforced hard gates, the shorter prompt and the recorded latency and
cost. Changing the generator, as the behaviour spec's open decision 3 proposes,
is the remaining lever with a plausible chance of moving the global axes.

Owner decision required: revise the gate and accept the prototype on that basis,
or keep the original gate and treat the architecture as a parked experiment.
