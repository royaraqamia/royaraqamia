# Online quality signals

30 day window, generated 2026-11-18T16:32:05.041Z.

Derived from `agent_turns`, `chat_messages` and `users` only. No schema, UI
or extra model call: zero token cost to members. Bodies and emails are read
to classify rows, but neither is ever printed.

| Signal                                     | Count |   Rate |
| ------------------------------------------ | ----: | -----: |
| Assistant turns                            |    44 |      - |
| Failed turns                               |     6 |  13.6% |
| Failed turns with a named cause            |     6 | 100.0% |
| Failed turns from harness accounts (of 39) |     6 |  15.4% |
| Failed turns from members (of 5)           |     0 |   0.0% |
| Turns retried at least once                |     2 |   4.5% |
| Answered user-to-user pairs                |     1 |      - |
| Repeated question after an answer          |     0 |   0.0% |
| Short follow-up after an answer            |     0 |   0.0% |

## Failure codes

- provider_failure: 2 (harness 2, member 0) — the provider returned no answer; the turn ended after its retry
- file_failure: 2 (harness 2, member 0) — the attachment could not be read: no text layer, empty, broken, locked or too large
- provider_busy: 2 (harness 2, member 0) — a 402/429 capacity or billing refusal; the turn was retried once

## Account split

Harness accounts are `E2E_TEST_EMAIL`, `E2E_VISUAL_EMAIL` and `ADMIN_EMAILS`.
Their turns are test traffic, not member experience; an unknown owner stays
in the member bucket so a failure is never hidden.

| Account class | Turns | Failed | Failed rate |
| ------------- | ----: | -----: | ----------: |
| harness       |    39 |      6 |       15.4% |
| member        |     5 |      0 |        0.0% |

A repeated question is a weak dissatisfaction proxy; a short follow-up such
as "no" or "?" is weaker still. Neither is a verdict on one reply — they are
trend lines to compare before and after a prompt change, and candidates for
new cases in the simulated suite.
