# Online quality signals

30 day window, generated 2026-11-17T21:48:55.814Z.

Derived from `agent_turns` and `chat_messages` only. No schema, UI or extra
model call: zero token cost to members. Bodies are read but never printed.

| Signal                            | Count |  Rate |
| --------------------------------- | ----: | ----: |
| Assistant turns                   |    35 |     - |
| Failed turns                      |     6 | 17.1% |
| Turns retried at least once       |     2 |  5.7% |
| Answered user-to-user pairs       |     0 |     - |
| Repeated question after an answer |     0 |   n/a |
| Short follow-up after an answer   |     0 |   n/a |

## Failure codes

- provider_failure: 2
- file_failure: 2
- other: 2

A repeated question is a weak dissatisfaction proxy; a short follow-up such
as "no" or "?" is weaker still. Neither is a verdict on one reply — they are
trend lines to compare before and after a prompt change, and candidates for
new cases in the simulated suite.
