# The webhook replaces the poll, because the poll was a clock

ADR 0121 chose polling on purpose: a webhook needs a public endpoint, and the only endpoint this
project had was Vercel, whose Hobby Fluid Active CPU cap had already been exceeded once. The
trade-off was explicit — five minutes of latency for zero metered cost. One day of real use changed
one input to that decision: the owner asked for seconds, not minutes, and the messages are for
work he wants to start now, not tomorrow.

So the door moves to a Supabase Edge Function. It is the only shape that can be instant: a bot is
either pushed to or it asks, and asking pays its interval no matter how short the interval is.

## What the function does, and refuses to do

Telegram calls `POST /functions/v1/telegram` with an update. The function checks the
`X-Telegram-Bot-Api-Secret-Token` header, ignores anything that is not a text message from the one
allowed chat, writes the update to `telegram_messages` (unique `update_id`, so Telegram's retries are
no-ops), and dispatches `telegram.yml` through the existing `dispatch_github_workflow`, which keeps
the Vault PAT as the only credential that can start a workflow.

It calls no model, holds no repository token and files no issue. The routing, the allowed chat, the
issue creation and the answers stay in the workflow, where they already worked.

## Why it stores before it dispatches

A dispatch can fail — GitHub is down, the PAT was rotated, the call timed out. Forwarding alone
would lose the message. Storing first means the row survives, and the fifteen-minute `drain` run
picks up anything with no `processed_at`. That is the whole backstop, and it is why the cron did not
disappear: it stopped being the latency mechanism and became the dead-man's switch.

Claiming is a compare-and-set on `processed_at`, so the webhook's run and the backstop's run cannot
both handle one message.

## The cost, honestly

Supabase's Free plan includes 500,000 Edge Function invocations a month. Thirty messages a day is
900 — about 0.18%. Five hundred a day is 3%. The quota does not grow with time, unlike the cron it
replaces, which spent 1,440 workflow runs a day whether or not anyone wrote anything.

Two free-plan limits are worth knowing rather than discovering: logs are kept **one day**, so
debugging has a short window, and a project pauses after a week of inactivity — irrelevant for a bot
the owner uses, but it is why the backstop also runs.

Latency is not one second, and nobody should expect it to be. The function answers in milliseconds,
but the work happens in a GitHub Actions run: dispatch, queue, runner start, then the model. Measured
end to end it is roughly 20–40 seconds, against five minutes before.

## What replaces what

- **Supersedes ADR 0121's polling.** The reasoning there was sound for the requirement it had; the
  requirement changed.
- **Keeps 0121's routing** — plain text answers and never files; `/task` queues; `/now` runs and
  stops at an open pull request (ADR 0066); `/task` merges through the implementer (ADR 0120).
- **Keeps the storage** — transcript, summary, reminders — and adds `processed_at`.
- **Does not touch Vercel.** The site's budget is unaffected.

## Considered options

- **A one-minute cron.** One character, no new service, ~60–90 s replies. Rejected: it trades the
  owner's stated requirement for a cheaper construction, and it makes 1,440 runs a day that exist
  only to ask "anything new?".
- **A long-poll run** (one job loops for hours). Rejected: it holds a runner, dies at the six-hour
  cap, and a crash silently stops the bot until the backstop notices.
- **A webhook on Vercel.** Rejected for the same reason as before: metered on the one meter this
  project already exhausted.
- **Deleting the workflow runs** to hide the cron's noise. Rejected: a janitor for a problem the
  webhook removes.
