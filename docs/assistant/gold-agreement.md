# Judge vs gold set

30 labelled replies · agent-proposed against docs/assistant/nour-behaviour-spec.md — owner review required before these become a gate

| Axis | n | MAE | within 1 point |
| --- | ---: | ---: | ---: |
| naturalness | 26 | 0.54 | 88% |
| warmth | 15 | 0.42 | 100% |
| helpfulness | 17 | 0.35 | 100% |
| conciseness | 8 | 0.67 | 75% |
| language_fit | 9 | 1.11 | 44% |
| boundaries | 5 | 0.33 | 100% |

Overall: MAE 0.54, within 1 point 88%.

## Hard-gate disagreements

- en-03: gold=fail, harness=pass

## Label provenance

30 replies from a three-run baseline. Scores are 0-5 on the axes named in each case; hardGate marks a reply that violates a hard rule.
agent-proposed against docs/assistant/nour-behaviour-spec.md — owner review required before these become a gate

