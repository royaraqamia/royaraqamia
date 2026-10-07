---
description: Run the repo's typecheck, lint, and test gates, then fix any failures
agent: build
---

Run the project's verification gates in order and fix anything that fails:

1. `npm run typecheck`
2. `npm run lint:fix`
3. `npm test`

Stop at the first gate that fails, fix the cause (not the symptom), then re-run
from that gate. Do not skip or weaken a gate to make it pass.

Report a concise summary: what failed, what you changed, and the final pass/fail
status of each step. Do not commit.
