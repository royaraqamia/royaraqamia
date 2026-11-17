# Judge vs gold set

30 labelled replies · agent-proposed against docs/assistant/nour-behaviour-spec.md — owner review required before these become a gate

**calibration-only until a human re-labels 10 cases blind to these scores**

> These are fixed replies from the pre-dialect-B baseline. They calibrate the
> judge on known text; they are not the current product behaviour.

| Axis         |   n |  MAE | within 1 point | Gate     |
| ------------ | --: | ---: | -------------: | -------- |
| naturalness  |  26 | 0.54 |            88% | yes      |
| warmth       |  15 | 0.42 |           100% | yes      |
| helpfulness  |  17 | 0.33 |           100% | yes      |
| conciseness  |   8 | 0.67 |            75% | advisory |
| language_fit |   9 | 1.11 |            44% | advisory |
| boundaries   |   5 | 0.33 |           100% | yes      |

Calibrated axes only: MAE 0.44, within 1 point 95%.

## Hard-gate disagreements

- ar-msa-04: gold=fail, harness=pass
- en-03: gold=fail, harness=pass

## Label provenance

30 replies from a three-run baseline. Scores are 0-5 on the axes named in each case; hardGate marks a reply that violates a hard rule.
agent-proposed against docs/assistant/nour-behaviour-spec.md — owner review required before these become a gate
