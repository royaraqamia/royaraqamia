# نور eval harness

Two tiers, one spec (`docs/assistant/nour-behaviour-spec.md`) and one case list
(`suite.json`). Both call the same gateway and model the product uses: key
`OPENCODE_API_KEY` (or `AI_CHAT_API_KEY`), default endpoint
`https://opencode.ai/inference/go/openai/v1`, default model
`deepseek-v4.1-flash`. The judge is a different model (`claude-haiku-5-5`).

```powershell
# 1. model layer — real SYSTEM_PROMPT read from source, simulated messages, no tools
node scripts/nour-evals/run-model-layer.mjs --env D:\Projects\royaraqamia\.env

# 2. agent layer — real ChatAgentService.turn(), real gateway, mocked data layer
$line = Get-Content D:\Projects\royaraqamia\.env | Where-Object { $_ -match '^OPENCODE_API_KEY=' } | Select-Object -First 1
$env:OPENCODE_API_KEY = ($line -split '=',2)[1].Trim().Trim('"')
.\node_modules\.bin\vitest.cmd run --config scripts/nour-evals/vitest.eval.config.mts

# 3. merge both into docs/assistant/eval-report.{json,md}
node scripts/nour-evals/combine.mjs
```

The agent runner is deliberately `*.eval.mts` with its own Vitest config. The
repo's default `npm test` must never pick it up: it makes live network calls and
spends gateway quota.

`recompute.mjs` re-runs the deterministic gates over stored replies without any
model calls, for when the gate logic changes.

Reports: `docs/assistant/eval-report-model.*`, `scripts/nour-evals/eval-report-agent.json`,
and the combined `docs/assistant/eval-report.*`.
