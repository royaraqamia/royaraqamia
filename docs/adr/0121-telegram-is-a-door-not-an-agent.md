# Telegram is a door, not an agent

The owner works from a phone more often than from a laptop, and the autonomous pipeline only
spoke GitHub: to ask for something you filed an issue, to hear what happened you opened the
Actions tab. This ADR records the bridge that closes that gap, and — more usefully — the four
things it deliberately is not.

## A door: it files work, it does not do work

A message becomes an issue, an issue becomes a run of the workflow that already owns that job, and
the answer comes back to the chat. The bridge never checks out a repository and never holds a token
that can push code. Its one model call is the answer to a plain message — no tools, no repository —
so reading the chat cannot change anything. Two write lanes, and they are the two the pipeline
already had:

- **`/now`** comments `/oc` on the issue it just opened. That is the interactive path, and ADR 0066
  still governs it: the run stops at an open pull request and a person merges.
- **`/task`** files the issue with `ready-for-agent`. The Issue Implementer picks it up in its next
  round and merges it when its checks are green, exactly as ADR 0120 describes.
- **plain text is neither.** It is answered and nothing is filed: a sentence that is not a task must
  not become an issue, which is the one thing the owner asked for explicitly.

Neither lane is new behaviour. The bridge only chooses between them, which is why it needs no
permission of its own beyond `issues: write`.

## Polling, because the other door is metered

A Telegram bot is a webhook or a poll. A webhook needs a public HTTPS endpoint, and the only one this
project has is Vercel. Vercel Hobby has no overage and this account already exceeded its Fluid Active
CPU cap once (`docs/vercel-usage.md`): a webhook would spend about ten percent of that cap on chat
alone, to buy a latency nobody asked for. The repository is public, so Actions minutes are free, and
`getUpdates` with an offset stored in Postgres gives the same guarantee at five-minute latency. The
owner's tolerance for asynchronous work is fifteen minutes.

The offset is one row and one consumer. Two consumers advancing one offset is how an update
disappears, so the workflow uses a single concurrency group and never cancels a run in progress.

## Two summaries, triggered by completion

The planner runs at 03:00 UTC and the implementer is dispatched when the planner finishes, but
GitHub's scheduler lands hours late and sometimes not at all. A summary at a fixed clock therefore
reports on a day that may not have happened yet — or skips the day the run moved. The trigger is
`workflow_run: completed` on the planner and on the implementer, so the summary is always about the
run that just finished, and a drifted schedule cannot cost the day its report.

The same trigger carries the two alerts the owner asked for: `Release Health` and `Migration Drift`
report their failure to the chat instead of waiting to be noticed in the Actions tab.

## It stores its own memory, and only its own

Telegram keeps the chat but hands a bot no history: `getUpdates` returns pending updates and
nothing else. So the transcript is Postgres — the log kept 90 days, a rolling summary kept, and the
`update_id` unique so a redelivery cannot file a second issue. Nothing is duplicated into GitHub
that GitHub already keeps; the issue and pull request are the record of what was done.

The owner is the only chat allowed. That allowlist is enforced in the script rather than in the
workflow, so a run that receives an update from anywhere else records nothing and answers nothing,
even if the secret is ever shared by mistake.

## Considered options

- **A Vercel webhook.** Rejected: instant for a workflow the owner explicitly does not want to be
  instant, against a metered cap that has already been hit.
- **A model deciding whether a message is a task or a question.** Rejected: it costs a call per
  message and its mistakes are expensive in one direction (a junk issue) and invisible in the other
  (a task that was answered instead of done). The discriminator is the command, which is free and
  literal; the model only writes the answer to a message that is already known not to be a task.
- **A dedicated agent loop in the workflow.** Rejected: it would duplicate the OpenCode setup, skip
  the issue queue, and give a phone message a path around the review that everything else gets.
- **Auto-merging `/now` too.** Rejected: `/now` is the lane that has a person attached by
  definition, which is the reasoning ADR 0066 still holds.
- **A vision model for screenshots.** Not needed: `deepseek-v4.1-flash` declares image input
  (OpenCode's model metadata, and DeepSeek's own feature table marks Vision supported), so an
  attached screenshot is read by the agent that already does the work.

## What this does not change

- The planner, the implementer and `/oc` are untouched; the bridge only triggers and reports them.
- No new deploy target: nothing is added to Vercel, and the site's budget is unaffected.
- No memory outside Postgres: there is no provider-side history, and the model is not part of the
  bridge at all.
