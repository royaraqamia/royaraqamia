# 0213. A second model reviews a draft before it is shown

Accepted (assistant quality program).

## The decision

نور keeps one writer: `deepseek-v4.1-flash` runs the turn, calls the tools and
writes every word the member reads. A second model, `claude-haiku-5-5` by
default, reviews the finished draft **before any of it is revealed**. It never
writes member-facing text and never calls a tool. Its only power is to fail a
draft and hand one short private critique back to the writer, which produces
one rewrite; the higher-scoring draft that clears the gates is the one shown.

The answer is buffered for the length of the review. The member waits, sees the
turn's activity indicator and tool cards as before, then reads one answer that
never changes under their eyes. There is no first version to replace.

## Why this model

It is not the largest model in the catalog. It is the best-calibrated judge
measured in this repository: MAE 0.52 against the gold set, against 0.78 for
`gpt-6-luna` and 0.89 for `gemini-4-argon` (`docs/assistant/eval-calibration.md`).
It is also in the cheapest tier, and its rubric is static so input cache reads
dominate. Judging one turn costs a small fraction of a cent. A stronger model
that judges worse is not a better judge.

The model name lives behind `AI_CHAT_JUDGE_MODEL`; `off` restores the single
model turn with no gate, no wait and no extra call.

## What the judge may and may not do

- It scores five axes: naturalness, warmth, helpfulness, conciseness, boundaries.
  Language is **not** judged — the judge scored only 0.52 agreement on language
  fit, so language, non-ASCII digits and banned phrases are checked in code.
- It sees the member's message, the draft, and a trace of tool names and
  outcomes. It never sees a tool's payload, so private data does not leave the
  deployment twice.
- It does not decide whether a tool may run. Tiers, grants and the member's
  confirm already do that outside the model (ADR-0180). A review that arrives
  after a tool has run cannot unspend its call.
- The guarantee is the deterministic fallback, not the judge: if no draft
  clears the gates, a pre-approved failure sentence is shown instead.

## Why not the other routes

- **Self-critique in one model** has a lower ceiling: the writer that made the
  mistake is the one asked to find it.
- **Best-of-N with a scorer** multiplies writer cost by the number of drafts.
- **Training the judge into the writer** is the long-term direction, but needs
  a fine-tuning endpoint this deployment does not have, human-reviewed labels,
  and a permanent training pipeline. The review log from this gate is the
  dataset that makes that decision measurable later.

## Rollout

Stage 1 is what lands here: the gate, the rewrite and the review log. Stage 2
would act only on hard failures; stage 3 would widen to the soft axes if real
turns show members prefer the rewritten answers. Offline eval and the live
gate load the same rubric module (`shared/contracts/nour-quality.mjs`), so a
change to one cannot silently drift from the other.
