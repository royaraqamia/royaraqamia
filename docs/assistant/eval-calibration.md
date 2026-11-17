# Eval calibration — three runs, 30 labels

## What changed

- `run-model-layer.mjs --runs 3` aggregates three independent runs per case and
  reports per-case means instead of one sample. `judge()` now asks for structured
  JSON and retries three times: **105/105 judge calls returned JSON** in the
  baseline run, versus repeated nulls before.
- `rejudge.mjs` re-scores stored replies without calling the generator, so a
  rubric change can be measured against identical outputs.
- `scripts/nour-evals/gold-set.json` holds 30 labelled replies, and
  `check-gold.mjs` writes `gold-agreement.md`.
- The length gate is now soft (20 sentences is the runaway ceiling, 5-12 is a
  warning), matching the approved policy.

## Judge vs gold

Overall MAE **0.52**, 88% of axis scores within 1 point of the label.

| Axis         |  MAE | Within 1 | Usable as a gate? |
| ------------ | ---: | -------: | ----------------- |
| naturalness  | 0.27 |      96% | yes               |
| helpfulness  | 0.67 |      88% | yes               |
| warmth       | 0.38 |      93% | yes               |
| boundaries   | 0.60 |     100% | yes               |
| conciseness  | 0.54 |      75% | advisory          |
| language_fit | 1.15 |      56% | **no**            |

The judge clusters `language_fit` near 3 for every case: it gives 2-3 to correct
English replies and to correct dialect replies alike. Two stronger judges were
tried on the same 105 replies: `gpt-6-luna` MAE 0.78, `gemini-4-argon` MAE 0.89,
both worse than `claude-haiku-5-5` (0.52). So the judge stays, but **language_fit
is gated deterministically** by `detectLanguage()` in `lib.mjs`, and the judge's
language score is reported as advisory only.

## Three-run baseline (original prompt)

| Axis         | Mean |
| ------------ | ---: |
| conciseness  | 4.33 |
| boundaries   | 4.27 |
| helpfulness  | 3.70 |
| naturalness  | 3.56 |
| warmth       | 3.44 |
| language_fit | 3.17 |

Hard gates: 33/35 cases. The two failures are real: `en-03` produced
`You're welcome! Let me know if there's anything else you need.`, and
`dialect-egy-01` contained non-ASCII numerals in one run.

This is now a stable reference: compare a prompt change by running
`--runs 3` again and diffing these numbers, not by eyeballing one sample.

## Honest limits

- The 30 labels are **agent-proposed from the written spec**, not end-user
  judgements. The owner must review `gold-set.json` before any of this is a
  release gate. Until then it is a calibration instrument.
- 35 simulated cases, not real user conversations.
- The judge agrees well on the "robotic" axes (naturalness, warmth) but the
  absolute 4.0 threshold is still a convention, not an industry measurement.
- The agent tier has its own mocked-data caveats recorded in
  `nour-eval-findings.md`.
