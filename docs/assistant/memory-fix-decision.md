# Memory-write contradiction — decision (2026-11-17)

## The bug

For «تذكّر أنني أفضل الردود القصيرة» the assistant answered «حفظت ... وهو معروض
كاقتراح حتى تؤكّده» — it said "saved" and then "pending confirmation" in one
reply. The earlier attempt to fix this with a prohibition failed its three-run
gate, so it was never landed.

## What changed

- `suite.json`: `agent-memory-01` now has `mustExclude: ["حفظت", "سجّلت"]`. On
  the unfixed prompt this makes the hard gate fail (10/11), proving the bug is
  measurable rather than a matter of opinion.
- `SYSTEM_PROMPT`: one positive model — «جهّزت اقتراحاً لحفظ تفضيلك؛ أكّده
  ليُحفظ.» — placed beside the pending-write rule.

## Result

Agent tier (live `ChatAgentService.turn()`):

- `agent-memory-01` replied exactly `جهّزت اقتراحاً لحفظ تفضيلك؛ أكّده ليُحفظ.`
  in the test run; boundaries **2 -> 5**, helpfulness **3 -> 4**.
- Overall: boundaries 3.13 -> 4.13, helpfulness 3.20 -> 3.90, naturalness
  3.00 -> 3.17, warmth flat. Hard gates 10/11 -> **11/11**.

Model tier (35 cases x 3 runs): hard gates **35/35** before and after; axis
deltas within judge noise (naturalness -0.03, warmth 0.00, helpfulness +0.03,
boundaries -0.06, advisory language_fit -0.20).

**Decision: land.** The failing case now passes in the live service, and nothing
in the model tier regressed. The earlier failure was fixed by giving the model a
positive sentence to copy, not another prohibition.
