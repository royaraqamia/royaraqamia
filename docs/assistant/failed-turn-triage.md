# Failed-turn triage — 30-day window to 2026-11-18

Issue #1609. The six `agent_turns.state = 'failed'` rows were read through the
service role as aggregates only: no message body was read or printed. The
window's report is [online-signals.md](online-signals.md).

| Turn       | Created (UTC)    | Owner   | Code               | Named cause                                                                                                                                                                                                     | Verdict                                     |
| ---------- | ---------------- | ------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `c0e088f6` | 2026-11-04T13:16 | harness | `provider_failure` | Provider returned no answer; the generic failure path ended the turn after its retry. The deployed copy then said «من المساعد», which is why the earlier substring categorizer still caught it.                 | provider failure on harness traffic         |
| `843a4b1f` | 2026-11-05T08:09 | harness | `provider_failure` | Same generic provider failure, same older copy.                                                                                                                                                                 | provider failure on harness traffic         |
| `8d2dea1f` | 2026-11-10T15:08 | harness | `file_failure`     | A scanned PDF with no text layer: the turn deliberately answers with the remedy and records no answer (`NO_TEXT_LAYER` in the turn service). This is the production run recorded in #1162's 2026-11-10 comment. | harness fixture, intended product behaviour |
| `b2f1e8f7` | 2026-11-10T15:10 | harness | `file_failure`     | Same scan refusal, two minutes later in the same thread.                                                                                                                                                        | harness fixture, intended product behaviour |
| `147da544` | 2026-11-12T22:38 | harness | `provider_busy`    | Provider 402 or 429: «نور مشغولة الآن» is emitted only for those two statuses. `attempts = 1` rules out 402, which is not retried, so this was a 429 rate limit.                                                | harness traffic hitting provider capacity   |
| `b586c5a3` | 2026-11-12T23:12 | harness | `provider_busy`    | Same 429 after one retry.                                                                                                                                                                                       | harness traffic hitting provider capacity   |

Harness here means one of `E2E_TEST_EMAIL`, `E2E_VISUAL_EMAIL` or an
`ADMIN_EMAILS` entry. The two threads above are owned by the e2e/qa account and
the owner's admin account; the other two turn owners in the window are members
with five turns and no failures. So the 17.1% in the original report (6 of 35)
was a property of the test traffic, not of member experience. The next report,
over a window with nine more turns, reads 13.6% (6 of 44), with 0 of 5 member
turns failed.

No product bug was found in the turn path and no prompt changed, so the
three-run prompt gate is not part of this change. The failure sentences now live
in one shared contract that both the turn and the report import, and the report
names every failure code with its cause instead of falling back to `other`.

Two follow-ups need a schema decision: #1621 writes a stable failure code with
the turn so the report stops matching copy, and #1622 marks harness turns at
write time so member rates do not depend on a list of test emails.
