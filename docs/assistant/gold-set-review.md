# Senior review of the 30 gold labels (2026-11-18)

Verdict: the set is **usable as a fixed calibration instrument** but **not sound as a release gate yet**. Most labels are defensible; six issues need action, one of which is a factual data error I corrected here.

## Corrected in this change

1. `dialect-egy-01` had `hardGate: true` with the note "failed on non-ASCII digits in another repetition". The stored reply contains no Arabic-Indic digits and violates no hard rule. A hard-gate flag must describe **the stored reply**, not a different run. Corrected to `false`. This also removes a coincidental agreement with the harness that was masking the error.

## Issues needing your decision

2. **Same behavior, different gate across languages.** `en-03` is `hardGate: true` for the closing offer "anything else you need"; `ar-msa-04` has the same tail («إن احتجت أي شيء آخر») but `hardGate: false`, scored only 3/3/3. Either both are hard gates or neither is. Recommendation: make both hard gates and add the Arabic phrase to the harness banned list. I did not change this because it alters the gate definition, which is your call.

3. **A label penalizes a harness limitation.** `product-02` ("is نور free?") is scored helpfulness 3 because the answer exists in the site's own copy. The model tier has no access to that copy; the agent tier does. Scoring the model 3 for a missing tool is unfair. Recommendation: relabel helpfulness 4 with a note that this is a model-tier ceiling, and verify on the agent tier.

4. **`language_fit` labels are dead weight.** The judge is unreliable on that axis (MAE 1.15) and the deterministic gate only detects Arabic vs Latin, so labels like `dialect-gulf-01` = 3 and `dialect-magh-01` = 2 can never be enforced. `mixed-01` = 2 is a real blind spot: the question is mostly English, the answer Arabic, and the gate passes anyway. Recommendation: mark these labels `advisory` in the JSON, and add a dominant-language check if you want the mixed case gated.

5. **The replies are stale relative to the product.** All 30 come from the pre-dialect-B baseline. `en-03` and `ar-msa-04` no longer produce those replies; the memory and closing-offer bugs are fixed. The labels remain valid as _judge calibration on fixed text_ — that is their real purpose — but they must never be presented as current product scores. Add that warning to `check-gold.mjs` output.

6. **Axis coverage is uneven and consistent with my own prompt changes.** Some cases label 4 axes, others 2; `ar-msa-02` has no conciseness label despite being a textbook-length answer. More importantly, I wrote both the labels and the prompts being measured — an anchoring risk. Recommendation: you re-label a random 10 of the 30 from scratch, blind to my scores, and compare. If agreement is under ~80% within 1 point, replace my labels with yours before any threshold becomes a gate.

## What is sound and worth keeping

- Clear positive anchors: `ar-msa-05`, `ar-msa-03`, `en-02`, `dialect-lev-02`, `tone-01`, `mixed-02`, `religious-02`.
- Clear negative anchors: `en-03` (boilerplate), `ar-msa-01` (rule leaking into an unrelated answer), `dialect-magh-01` (MSA wall to a dialect greeting).
- Boundary labels on `en-06`, `religious-02`, `sensitive-01`, `tone-02` match the written spec.
- The 0-5 scale is applied consistently within each axis; judge agreement is strong on naturalness (MAE 0.27), warmth (0.38) and boundaries (0.60).

## Bottom line

Keep the set, but do not promote it to a release gate until items 2, 4 and 6 are resolved. The corrected `hardGate` flag is the only change applied here.
