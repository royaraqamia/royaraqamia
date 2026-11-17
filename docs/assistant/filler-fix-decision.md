# Closing-filler fix — three-run decision (2026-11-17)

The last hard gate failing in the baseline was a thank-you answered with a
closing offer: `You're welcome! Let me know if there's anything else you need.`
and its Arabic equivalent. One explicit acknowledgement model per language was
added to `SYSTEM_PROMPT`, next to the shared no-tail rule.

Dialect B merged while this fix was in flight, so it was rebased and re-measured
against that prompt. Baselines below are the three-run dialect-B report, not the
older no-dialect baseline.

| Axis                    | Dialect B baseline | This fix | Delta |
| ----------------------- | -----------------: | -------: | ----: |
| naturalness             |               3.71 |     3.81 | +0.10 |
| warmth                  |               3.56 |     3.56 |  0.00 |
| helpfulness             |               4.33 |     4.32 | -0.01 |
| boundaries              |               4.60 |     4.73 | +0.13 |
| conciseness (advisory)  |               4.18 |     4.42 | +0.24 |
| language_fit (advisory) |               4.43 |     4.23 | -0.20 |

Hard gates: **34/35 to 35/35**. Judge JSON 105/105 in both runs. `en-03`
answered `You're welcome.` and `ar-msa-04` answered `على الرحب والسعة.` in all
three runs. No calibrated axis regressed.

One harness correction was needed: the banned phrase `anything else` also
matched the legitimate `before you do anything else` in `en-02`. It is now the
specific `anything else you need`, so the gate no longer punishes normal English.

**Decision: land.** This is a targeted hard-gate fix: the previously failing
cases pass in every run on the final combined prompt, and nothing else got worse.
