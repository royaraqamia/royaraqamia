# Telegram bot

The owner's phone, wired to an agent that has the repository. One workflow
(`.github/workflows/telegram.yml`), one entry script (`scripts/telegram-bridge.mjs`) over
`scripts/telegram/*`, one Edge Function (`supabase/functions/telegram`). Design and reasoning:
[ADR 0129](../adr/0129-the-telegram-bot-is-an-agent.md) (why it is an agent, and what replaced the
commands), [ADR 0122](../adr/0122-the-webhook-replaces-the-poll-because-the-poll-was-a-clock.md) (why
the door is a webhook).

## How a message travels

1. Telegram `POST`s the update to `https://<ref>.supabase.co/functions/v1/telegram`.
2. The function verifies the `X-Telegram-Bot-Api-Secret-Token` header, ignores anything that is not
   from `TELEGRAM_CHAT_ID`, and stores the update in `telegram_messages` — text, a voice note, a
   picture or a document.
3. It dispatches `telegram.yml` through `dispatch_github_workflow` (Vault PAT, no new credential).
4. The `bridge` job claims the row, sends a status message, and runs `opencode run` with the
   conversation, the memory and the owner's words. Progress is edited into the status message.
5. The answer arrives; if files changed, the run files an issue, pushes a branch with
   `AGENT_PUSH_TOKEN`, opens a pull request, and posts it with a merge button.
6. Every five minutes `wake_telegram_bridge` asks Postgres whether anything is pending and dispatches
   only when the answer is yes. An idle day starts **zero** runs.

## What it is

An agent, not a dispatcher. One `opencode run` per message, with the checkout, `.agents/skills`, a
shell, the web, the Supabase MCP server and the Vercel CLI, on
`opencode-go/deepseek-v4.1-flash`. There are no commands: the sentence is the instruction.

A plain question is answered from what it can read. "Fix the header" edits files and opens a pull
request. "Deploy it" is refused until the owner asks for production explicitly, and the guard rails
are code — see below.

## What it may and may not do

| Action                                              | How                                                           |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Read any file, search, `git log`/`diff`             | Allowed                                                       |
| Run a command, a test, the repo's own scripts       | Allowed                                                       |
| Edit files                                          | Allowed; the working tree is what the branch is made from     |
| File an issue, push a branch, open a PR             | The publish step, after the turn, with `AGENT_PUSH_TOKEN`     |
| Merge into `main`                                   | Two button taps, 30 minutes, `merge` job only                 |
| `git commit`/`push`, `gh pr merge`, `vercel --prod` | Refused by the shims in `scripts/telegram/guard-decision.mjs` |
| Delete a memory                                     | `احذف رقم 3`, matched by `parseForget`, nothing broader       |

The `bridge` job's own token is read-only for contents and pull requests, and `AGENT_PUSH_TOKEN` is
deleted from the environment the agent's process receives. Three independent things would have to
fail at once for a message to write `main`.

## The pieces

| File                                  | Job                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `scripts/telegram/answer.mjs`         | one message: transcribe, attach, run, deliver, publish                            |
| `scripts/telegram/agent.mjs`          | spawns `opencode run`, reads the JSON event stream                                |
| `scripts/telegram/progress.mjs`       | the status message, chunking, the stop button                                     |
| `scripts/telegram/prompt.mjs`         | the instructions: language, length, assumptions, tools, confirmations, formatting |
| `scripts/telegram/publish.mjs`        | issue, branch, push, pull request                                                 |
| `scripts/telegram/merge.mjs`          | the confirmed merge, and the step machine behind it                               |
| `scripts/telegram/jobs.mjs`           | drain, reminders, digests, alerts, distillation, probe                            |
| `scripts/telegram/store.mjs`          | the message log, context, memory, confirmations                                   |
| `scripts/telegram/text.mjs`           | markdown to Telegram HTML, chunking, time and language parsing                    |
| `scripts/telegram/guard-decision.mjs` | which command is refused, and why                                                 |

## The status message

Sent before the first tool call, edited at most every three seconds with what the agent is doing
(`أقرأ config.mjs…`, `أبحث في المستودع…`, `أشغّل npm run test…`), carrying a **إيقاف** button that sets
`cancel_requested` on the row. The run reads that column between steps, so a tap reaches a turn that
is already working. When the answer lands, the status message is deleted rather than edited: the
answer is chunked, and a stale stop button under a finished answer only invites a tap that fails.

## Memory

`telegram_memories` holds durable facts, `telegram_summaries` the rolling paragraph, and
`telegram_messages` the transcript (90 days). The agent sees memory and summary first, then the last
twelve exchanges, with markup stripped. "ماذا تتذكر عني؟" lists them with ids; "احذف رقم 3" deletes
one, deterministically, without giving the agent a `DELETE`.

## Reliability contract

- Every message ends in exactly one answer, or one apology carrying a reference (`failureLine`); the
  provider's own error text goes to the run log, never to the chat.
- A row is claimed with a compare-and-set, so no message is answered twice and no pull request is
  opened twice.
- A deterministic failure (a 4xx, a file Telegram no longer has) is final on the first attempt; only
  a failure that might pass is retried, three times.
- Every delivered message is recorded, and `recordOutbound` refuses an empty body — the crash that
  sent a PostgREST 400 into the chat.
- An alert repeats at most once per thirty minutes per workflow.

## When something is wrong

Run `workflow_dispatch` with `mode: probe` to measure the transcription endpoint, `mode: agent-probe`
to measure the assistant gateway, or read the run log — every line is prefixed `telegram:`. The chat
gives the owner a reference that grep finds in that log.
