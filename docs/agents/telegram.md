# Telegram bridge

The owner's phone, wired to the autonomous issue pipeline. One workflow
(`.github/workflows/telegram.yml`), one script (`scripts/telegram-bridge.mjs`), one Edge Function
(`supabase/functions/telegram`), and two migrations. Design and reasoning:
[ADR 0121](../adr/0121-telegram-is-a-door-not-an-agent.md) (why it is a dispatcher) and
[ADR 0122](../adr/0122-the-webhook-replaces-the-poll-because-the-poll-was-a-clock.md) (why the door is
a webhook).

## How a message travels

1. Telegram `POST`s the update to `https://<ref>.supabase.co/functions/v1/telegram`.
2. The function verifies the `X-Telegram-Bot-Api-Secret-Token` header, ignores anything that is not a
   text message from `TELEGRAM_CHAT_ID`, and stores the update in `telegram_messages`.
3. It dispatches `telegram.yml` through `dispatch_github_workflow` (Vault PAT, no new credential).
4. The workflow drains unprocessed rows, routes them, and replies — ~20–40 seconds end to end.
5. Every five minutes a pg_cron function (`wake_telegram_bridge`) asks Postgres whether anything is
   pending — an undispatched update, or a due reminder — and dispatches the workflow only when the
   answer is yes. An idle day therefore starts **zero** runs.

## What it is

A dispatcher. A message becomes an issue; the workflow that owns that kind of work runs; the result
comes back to the chat. It never checks out a repository and cannot push code by itself.

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
| `TELEGRAM_WEBHOOK_SECRET`   | any long random string; Telegram echoes it on every call    |
| `SUPABASE_ACCESS_TOKEN`     | already present; deploys the function                       |
| `SUPABASE_PROJECT_REF`      | already present                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | already present for the other workflows                     |
| `SUPABASE_URL`              | optional — `SUPABASE_PROJECT_REF` is used when it is absent |

Then merge a change under `supabase/functions/telegram/**`: the workflow writes the function's
secrets, deploys it, and calls `setWebhook` with the secret. All three steps are idempotent, so a
re-run is harmless. Finally send `/tz +3` once.

## Storage

| Table                | Purpose                                            | Retention                         |
| -------------------- | -------------------------------------------------- | --------------------------------- |
| `telegram_chats`     | who may talk, and their offset                     | kept                              |
| `telegram_messages`  | the transcript, `update_id` unique, `processed_at` | 90 days (`sweep_telegram_bridge`) |
| `telegram_summaries` | unused since the answer reads the last exchanges   | —                                 |
| `telegram_reminders` | what was asked and whether it was sent             | sent rows pruned at 90 days       |
| `telegram_state`     | unused since the webhook replaced polling          | —                                 |

Row level security is on and there is no policy: only `service_role` reads or writes. There is no
signed-in user behind a chat, so an anon key reads nothing.

## Troubleshooting

- **No reply within a minute or two.** The webhook did not reach the function, or the dispatch failed.
  Check the backstop: `select * from cron.job where jobname = 'telegram-bridge-wake'` should exist and
  fire every five minutes, dispatching only when there is a row to work on. The backlog is
  `select count(*) from telegram_messages where direction = 'in' and processed_at is null`.
- **Every call answers 401.** `TELEGRAM_WEBHOOK_SECRET` differs between the function's secrets and the
  value passed to `setWebhook`. Re-run the deploy job, which sets both.
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
