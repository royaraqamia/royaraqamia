# Coding runner evals

`tasks.json` is the scored suite that gates changes to the runner prompt and its
tools (ADR-0219, decision 6). Twelve small, deterministic tasks exercise the
same execution plane a member uses: plan, local reads and writes, repository
commands, verification, checkpoints and the pull-request handoff.

## Task shape

Each entry carries:

- `id` - stable name used in reports and as the seed for the task branch.
- `prompt` - the instruction given to the runner, unchanged.
- `fixture.baseBranch` - the branch the fixture repository starts on.
- `fixture.files` - relative path to file content; write these into an empty
  directory and initialise it as a git repository before starting the task.
- `fixture.setup` - additional shell commands to run in that directory, in
  order, before the runner starts. All twelve fixtures are empty or one-step.
- `checks` - shell commands run from the fixture directory after handoff. The
  task passes only when every command exits 0.
- `expectedTokenBudget` - input/output token caps and runner minutes; a task
  that exceeds them fails even when its checks pass.

Fixtures must stay small and offline. A task that needs a network, a secret or
an installed dependency does not belong in this suite: it would measure the
environment rather than the runner.

## Running the suite

The gate command is `node scripts/coding-evals.mjs --suite coding`. That harness
script is part of the control-plane workstream; this change does not add it and
does not edit `package.json`, which another agent owns. To sanity-check the data
file alone:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('evals/coding/tasks.json', 'utf8'))"
```

Each task is run with mode `plan` first and again with mode `full`, against a
fresh fixture, so both the approval pause and the unattended path are scored.
The runner must finish inside `expectedTokenBudget` and pass every `checks`
entry on both runs.

## The reviewer gate

`reviewer-gate.json` is the evidence that decides whether the second reviewer
model may run (ADR-0223). It is off in this tree. `npm run check:coding-reviewer`
recomputes the gate from the numbers in the file, so setting `"status": "on"`
without clearing `thresholds` fails CI.

To switch it on, run the suite with the reviewer enabled on a fixed runner
version (the harness is issue #1897), and record in `evidence`:

- `recordedAt` — when the run happened;
- `suite` — exactly `evals/coding/tasks.json`;
- `runs` — how many scored tasks the reviewer saw;
- `catchRate` — the share where it flagged a defect the deterministic checks or
  the recorded human label already identified;
- `falsePositiveRate` — the share where it blocked a task that passed;
- `medianAddedLatencyMs` — the median extra wall-clock time per reviewed task;
- `costUsdPerReview` — the mean provider cost of one review, from the same
  `pricing` table the control plane uses.

The model named in `model` must have a `pricing` entry. A price the table does
not name costs `null`, and the gate stays closed.

## Adding a task

Add one entry with a new `id`, keep the fixture under a handful of files, and
write checks that fail on the unmodified fixture and pass on the intended
result. Never make a check depend on the model's wording: assert behaviour with
a command. Changing the runner prompt or a tool definition requires a full
green run of this suite before it ships.
