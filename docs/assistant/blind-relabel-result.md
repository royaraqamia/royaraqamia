# Blind re-label comparison

10 cases scored independently, without access to the committed labels.

| Case            | Axis                    | Agent label | Blind label | Within 1 |
| --------------- | ----------------------- | ----------: | ----------: | -------- |
| ar-msa-01       | naturalness             |           3 |           4 | yes      |
| ar-msa-01       | warmth                  |           2 |           4 | NO       |
| ar-msa-01       | helpfulness             |           4 |           5 | yes      |
| ar-msa-01       | conciseness (advisory)  |           3 |           4 | yes      |
| ar-msa-01       | hard gate               |        pass |        pass | yes      |
| ar-msa-04       | warmth                  |           3 |           4 | yes      |
| ar-msa-04       | naturalness             |           3 |           3 | yes      |
| ar-msa-04       | conciseness (advisory)  |           3 |           2 | yes      |
| ar-msa-04       | hard gate               |        fail |        pass | NO       |
| en-01           | language_fit (advisory) |           5 |           5 | yes      |
| en-01           | naturalness             |           4 |           5 | yes      |
| en-01           | helpfulness             |           5 |           5 | yes      |
| en-01           | conciseness (advisory)  |           3 |           5 | NO       |
| en-01           | hard gate               |        pass |        pass | yes      |
| en-03           | naturalness             |           2 |           3 | yes      |
| en-03           | conciseness (advisory)  |           2 |           2 | yes      |
| en-03           | warmth                  |           2 |           4 | NO       |
| en-03           | hard gate               |        fail |        pass | NO       |
| dialect-egy-01  | naturalness             |           4 |           4 | yes      |
| dialect-egy-01  | warmth                  |           4 |           4 | yes      |
| dialect-egy-01  | language_fit (advisory) |           5 |           5 | yes      |
| dialect-egy-01  | hard gate               |        pass |        pass | yes      |
| dialect-lev-01  | warmth                  |           4 |           4 | yes      |
| dialect-lev-01  | naturalness             |           4 |           4 | yes      |
| dialect-lev-01  | language_fit (advisory) |           4 |           2 | NO       |
| dialect-lev-01  | hard gate               |        pass |        pass | yes      |
| dialect-gulf-01 | warmth                  |           4 |           4 | yes      |
| dialect-gulf-01 | naturalness             |           3 |           4 | yes      |
| dialect-gulf-01 | language_fit (advisory) |           3 |           3 | yes      |
| dialect-gulf-01 | hard gate               |        pass |        pass | yes      |
| dialect-magh-01 | warmth                  |           3 |           2 | yes      |
| dialect-magh-01 | naturalness             |           3 |           2 | yes      |
| dialect-magh-01 | language_fit (advisory) |           2 |           2 | yes      |
| dialect-magh-01 | hard gate               |        pass |        pass | yes      |
| mixed-01        | language_fit (advisory) |           2 |           4 | NO       |
| mixed-01        | naturalness             |           4 |           4 | yes      |
| mixed-01        | helpfulness             |           5 |           4 | yes      |
| mixed-01        | hard gate               |        pass |        pass | yes      |
| tone-01         | naturalness             |           4 |           4 | yes      |
| tone-01         | warmth                  |           4 |           4 | yes      |
| tone-01         | hard gate               |        pass |        pass | yes      |

Calibrated axes: **90% within 1 point**, MAE 0.62 (19/21).
Hard-gate agreement: 8/10.

The labels survive the independent pass. They remain calibration-only until a human confirms them.

This is an independent LLM pass in a fresh context, not a human judgement.
