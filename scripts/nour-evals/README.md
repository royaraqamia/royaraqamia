# نور eval harness

Two tiers, one spec (`docs/assistant/nour-behaviour-spec.md`) and one case list
(`suite.json`). Both call the same gateway and model the product uses: key
`OPENCODE_API_KEY` (or `AI_CHAT_API_KEY`), default endpoint
`https://opencode.ai/inference/go/openai/v1`, default model
`deepseek-v4.1-flash`. The judge is a different model (`claude-haiku-5-5`).

```powershell
# 1. model layer — real SYSTEM_PROMPT read from source, simulated messages, no tools
node scripts/nour-evals/run-model-layer.mjs --env D:\Projects\royaraqamia\.env

# 2. agent layer — real ChatAgentService.turn(), real gateway, mocked data layer.
#    It records the provider turn, then scores it. See `eval:agent` below.
$line = Get-Content D:\Projects\royaraqamia\.env | Where-Object { $_ -match '^OPENCODE_API_KEY=' } | Select-Object -First 1
$env:OPENCODE_API_KEY = ($line -split '=',2)[1].Trim().Trim('"')
npm run eval:agent -- --live

# 3. merge both into docs/assistant/eval-report.{json,md}
node scripts/nour-evals/combine.mjs
```

The agent runner is deliberately `*.eval.mts` with its own Vitest config. The
repo's default `npm test` must never pick it up: it makes live network calls and
spends gateway quota.

## `npm run eval:agent`

The agent tier has a recorded transcript (`agent-transcript.json`) and four
named scores: tool choice, argument validity, confirmation discipline and Arabic
quality (ADR-0185 decision 3).

```powershell
npm run eval:agent                       # offline: score the committed transcript
npm run eval:agent -- --live             # re-record through the provider, then score
npm run eval:agent -- --update-baseline  # accept the current scores as the floor
```

The offline run makes no network call and spends no token, so `check:agent-evals`
(already in CI) runs it on every pull request. The report is
`docs/assistant/eval-report-agent.md`; a score that falls below
`agent-baseline.json` fails with its name, and the transcript carries the
SHA-256 of the shipped system prompt, so a prompt edit that was not re-recorded
fails with that sentence rather than a number moving for no visible reason.

`recompute.mjs` re-runs the deterministic gates over stored replies without any
model calls, for when the gate logic changes.

## Comparing two models

A model change is a pull request that carries the score before and after
(ADR-0185 decision 2). Run the agent tier once per model under a label, then
diff the two reports. A label writes `agent-transcript-<label>.json` and
`eval-report-agent-<label>.json` beside the shipped files, so the committed
baseline is never overwritten.

```bash
AI_CHAT_MODEL=deepseek-v4.1-flash node scripts/nour-evals/eval-agent.mjs --live --label current
AI_CHAT_MODEL=<candidate>           node scripts/nour-evals/eval-agent.mjs --live --label candidate
node scripts/nour-evals/compare-models.mjs --current current --candidate candidate
```

`compare-models.mjs` writes `docs/assistant/eval-model-comparison.md` with the
four named scores, the judge axes, generation cost per turn (from the usage the
gateway reports) and the failing fixtures on each side. Neither run changes the
default model.

Reports: `docs/assistant/eval-report-model.*`, `scripts/nour-evals/eval-report-agent.json`,
and the combined `docs/assistant/eval-report.*`.
