# Blind re-label decision (2026-11-18)

An independent evaluator in a fresh context scored 10 cases from
`scripts/nour-evals/blind-relabel.md` without access to the committed labels or
any eval report.

Result: **90% of calibrated-axis scores within 1 point** (19/21, MAE 0.62).
That clears the 80% threshold set in the gold-set review; the agent-authored
labels are not an artifact of anchoring on the prompts it wrote.

Hard-gate agreement was initially 8/10. Both disagreements were closing offers
("anything else you need" / «إن احتجت أي شيء آخر»). The independent judge was
right to flag an ambiguity: the written spec listed wrong language, digits,
unexecuted actions, fatawa and instruction leaks as hard gates, but not canned
closing filler. The spec has been corrected to name that gate explicitly, and a
second fresh-context judgment of just those two replies then agreed 2/2.

Two other calibrated scores differed by 2 points (`ar-msa-01` warmth 2 vs 4,
`en-03` warmth 2 vs 4). They are within the judge's own error margin and do not
change the verdict; they are the first candidates for a human reviewer.

Advisory axes (`language_fit`, `conciseness`) were reported, not gated, exactly
as decided. `mixed-01` remains the documented dominant-language blind spot.

This is an independent LLM pass, not a human one. The set stays
`calibration-only`; a human can still use the worksheet to replace any label.
