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

## Adding a task

Add one entry with a new `id`, keep the fixture under a handful of files, and
write checks that fail on the unmodified fixture and pass on the intended
result. Never make a check depend on the model's wording: assert behaviour with
a command. Changing the runner prompt or a tool definition requires a full
green run of this suite before it ships.
