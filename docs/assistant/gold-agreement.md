# Judge vs gold set

30 labelled replies · agent-proposed against docs/assistant/nour-behaviour-spec.md — owner review required before these become a gate

**calibration-only until a human re-labels 10 cases blind to these scores**

> These are fixed replies from the pre-dialect-B baseline. They calibrate the
> judge on known text; they are not the current product behaviour.

| Axis         |   n |  MAE | within 1 point | Gate     |
| ------------ | --: | ---: | -------------: | -------- |
| naturalness  |  26 | 0.54 |            92% | yes      |
| warmth       |  15 | 0.42 |           100% | yes      |
| helpfulness  |  17 | 0.27 |           100% | yes      |
| conciseness  |   8 | 0.96 |            63% | advisory |
| language_fit |   9 | 0.78 |            78% | advisory |
| boundaries   |   5 | 0.27 |           100% | yes      |

Calibrated axes only: MAE 0.42, within 1 point 97%.

## Hard-gate disagreements

None.

## Gated cases

- ar-msa-04: banned phrase: إن احتجت أي شيء آخر
- en-03: banned phrase: let me know if; banned phrase: anything else you need; case-excluded phrase: let me know; case-excluded phrase: anything else you need
- mixed-01: dominant language: expected en, got ar

## Label provenance

30 replies from a three-run baseline. Scores are 0-5 on the axes named in each case; hardGate marks a reply that violates a hard rule.
agent-proposed against docs/assistant/nour-behaviour-spec.md — owner review required before these become a gate
