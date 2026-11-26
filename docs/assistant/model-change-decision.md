# Chat model change — decision (2026-11-26)

Verdict: **keep the default `deepseek-v4.1-flash`; the candidate is not a clear
win and the suite cannot yet separate the two models honestly.** The default is
unchanged and the provider key is untouched. This is a measurement, not a
switch.

## What was measured

- Harness: `node scripts/nour-evals/eval-agent.mjs --live --label <label>`, the
  real `ChatAgentService.turn()` against the production gateway, judge
  `claude-haiku-5-5`, 17 agent-tier cases.
- Current model: `deepseek-v4.1-flash` (labelled `current`).
- Candidate model: `deepseek-v4-pro` (labelled `candidate`), chosen as the
  flagship of the same family.
- Cost is generation list price per turn, from the `usage` the gateway reports
  on the last streamed frame; the judge is excluded because it is identical for
  both runs.

## Result

| Score                   | Current | Candidate | Delta |
| ----------------------- | ------: | --------: | ----: |
| tool_choice             |    0.88 |      0.88 |  0.00 |
| argument_validity       |    0.64 |      0.79 | +0.15 |
| confirmation_discipline |    0.88 |      0.88 |  0.00 |
| arabic_quality          |    1.00 |      1.00 |  0.00 |

Judge axes: helpfulness 3.69 -> 3.88 (+0.19), boundaries 4.09 -> 4.36 (+0.27),
naturalness 3.44 -> 3.44, warmth 3.00 -> 3.00, language_fit 5.00 -> 5.00.

Cost: mean **USD 0.001558** per turn for the current model against **USD
0.005823** for the candidate — about **3.7x**. Total for the 17-case run: USD
0.026491 against USD 0.098992.

Full per-case evidence: `docs/assistant/eval-model-comparison.md`,
`scripts/nour-evals/eval-report-agent-current.json`,
`scripts/nour-evals/eval-report-agent-candidate.json`, and the two recorded
transcripts beside them.

## Failing fixtures

- `agent-remote-injection-01` — both models: `read_url` not called, so tool
  choice, argument validity and confirmation all score 0.
- `agent-consultations-write-01` — both models: `book_consultation` not called
  or proposed, so all three score 0.
- `agent-memory-01` — both models: `remember: unexpected kind`.
- `agent-order-01` — current only: `record_expense: unexpected currency`.
- `agent-community-read-01` — current only: `list_my_posts: unexpected status`.

## Reading the numbers honestly

The gap is dominated by harness drift, not a quality difference:

1. **`read_url` is not declared in the harness.** The service only offers the
   tool when `deps.urlExtract` exists (`chat-agent-tools.ts`,
   `hasUrlExtract`), and the eval's `buildService` supplies `search` but not
   `urlExtract`. Both models correctly say they cannot open a link. The fixture
   is unsatisfiable as the harness is wired.
2. **`book_consultation` needs data the mock does not provide.**
   `list_consultation_options` runs against the mocked data layer and returns
   nothing, so neither model can fill the booking arguments.
3. **The argument scorer rejects valid optional keys.** `kind` (`remember`),
   `currency` (`record_expense`) and `status` (`list_my_posts`) are all optional
   fields in the real strict schemas, but `suite.json`'s `args` shape does not
   list them, so `scoreArguments` flags them as "unexpected". The candidate's
   +0.15 is therefore not a quality gain; it is the candidate sending fewer
   valid optional keys.
4. **The committed baseline no longer reproduces.** The shipped
   `agent-transcript.json` (recorded 2026-11-24) scores 1.00 on all four axes;
   a fresh run of the same default model scores 0.88 / 0.64 / 0.88 / 1.00. The
   stale transcript cannot be used as the "before" side of a model change.

## Recommendation

Keep `deepseek-v4.1-flash`. Re-measure only after the harness is corrected:

- give the eval an `urlExtract` stub (or drop `agent-remote-injection-01` from
  the scored set until it has one);
- mock `list_consultation_options` so `book_consultation` is reachable;
- let `scoreArguments` express optional keys, and update the suite `args` shapes;
- re-record the baseline so the "before" side is the model the product ships.

On the numbers that survive those gaps (tool choice, confirmation, Arabic,
naturalness, warmth) the two models tie; the candidate costs about 3.7x per turn
for a judge-only helpfulness/boundaries bump that is within noise. That is not a
reason to switch the default.
