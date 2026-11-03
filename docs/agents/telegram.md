# Telegram bridge

The owner's phone, wired to the autonomous issue pipeline. One workflow
(`.github/workflows/telegram.yml`), one script (`scripts/telegram-bridge.mjs`), one migration
(`supabase/migrations/20261113120000_telegram_bridge.sql`). Design and reasoning:
[ADR 0121](../adr/0121-telegram-is-a-door-not-an-agent.md).

## What it is

A dispatcher. A message becomes an issue; the workflow that owns that kind of work runs; the result
comes back to the chat. It never calls a model, never checks out a repository and cannot push code
by itself.

## Commands

| Message               | What happens                                                                            |
| --------------------- | --------------------------------------------------------------------------------------- |
| plain text            | **Answered**, nothing filed — a question, not a task                                    |
| `/task text`          | Issue in `royaraqamia` labelled `ready-for-agent`; the implementer merges it when green |
| `/task <repo>: text`  | Same, in `<repo>` — honoured only when the token can see that repository                |
| `/now text`           | Issue + `/oc` comment: runs in minutes, stops at an open pull request for review        |
| `/remind 09:30 text`  | Reminder at the wall clock in your stored offset                                        |
| `/remind in 30m text` | Reminder after a delay (`m`, `h`, `d`)                                                  |
| `/tz +3`              | Stores the offset once (`/tz Asia/Damascus` also works)                                 |
| `/help`               | The table above, in the chat                                                            |

The answer route is the bridge's only model call: DeepSeek V4.1 Flash through `OPENCODE_API_KEY`,
with no tools and no repository, so a chatty message cannot change anything. Its only context is the
rolling summary, which is why an old conversation costs a paragraph rather than a transcript.

The timezone is stored, not detected: Telegram sends none and a runner is always UTC, so without
`/tz` every reminder is interpreted at the Damascus default (+03:00).

## Messages it sends

- **Digest, twice a day.** One when the Issue Planner completes, one when the Issue Implementer
  completes — triggered by `workflow_run`, not by a clock, because the schedule drifts and a fixed
  hour would report on the wrong day.
- **Alerts.** `Release Health` and `Migration Drift` failures, sent when they go red.
- **Replies.** What it filed, what it could not parse, and the error text when a run fails.

Arabic prose, English identifiers: file names, commands, workflow names and issue numbers are left
as they are so they stay copy-pasteable.

## Setup

Repository secrets, none of which are in the repo:

| Secret                      | Where it comes from                                         |
| --------------------------- | ----------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`        | BotFather                                                   |
| `TELEGRAM_CHAT_ID`          | your own chat id; the only chat the bridge answers          |
| `SUPABASE_SERVICE_ROLE_KEY` | already present for the other workflows                     |
| `SUPABASE_URL`              | optional — `SUPABASE_PROJECT_REF` is used when it is absent |

Apply the migration (`supabase db push`), then send `/tz` once. The first poll runs within five
minutes; a `workflow_dispatch` run with mode `poll` does it immediately.

## Storage

| Table                | Purpose                                        | Retention                         |
| -------------------- | ---------------------------------------------- | --------------------------------- |
| `telegram_chats`     | who may talk, and their offset                 | kept                              |
| `telegram_messages`  | the transcript, `update_id` unique             | 90 days (`sweep_telegram_bridge`) |
| `telegram_summaries` | rolling paragraph injected into a task's issue | kept                              |
| `telegram_reminders` | what was asked and whether it was sent         | sent rows pruned at 90 days       |
| `telegram_state`     | the `getUpdates` offset                        | one row                           |

Row level security is on and there is no policy: only `service_role` reads or writes. There is no
signed-in user behind a chat, so an anon key reads nothing.

## Troubleshooting

- **No reply within ten minutes.** Check that the `telegram-bridge-poll` pg_cron job exists and is
  running (`select * from cron.job where jobname = 'telegram-bridge-poll'`). GitHub's own `schedule`
  is a backstop only — on 2026-11-03 it produced no run for 25 minutes while dispatches ran on time,
  which is why the wake-up is pg_cron calling the Actions dispatch API (ADR 0032).
- **The bot stops answering.** Check the last `Telegram Bridge` run. A 401 means a rotated token; a
  400 from Telegram usually means a `chat_id` that is not the chat writing.
- **A message was processed twice.** It cannot be: `update_id` is unique and the row is written
  before the issue is filed. A duplicate issue means the same text was sent twice, which is not a
  redelivery.
- **A reminder fired at the wrong hour.** Send `/tz` again; the stored offset is what is used, not
  the runner's clock.
- **A `repo:` prefix was ignored.** The name has to be a repository the token can see; a typo falls
  back to `royaraqamia` rather than opening an issue somewhere unexpected.
- **The digest is missing.** `workflow_run` only fires for workflows on the default branch, so a
  planner run before the merge that introduced this file reports nothing.
