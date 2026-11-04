# The Telegram bot is an agent

ADR 0121 made the bot a door: it filed an issue and a chat completion with no tools answered the
message. That was defensible while the only question was "which lane", and it failed the first time
the owner asked something that needed evidence. The recorded session makes the argument better than
any paragraph could:

- "هل تستطيع قراءة الـ repo؟" was answered by escalating to a repository lookup, and the answer came
  back as the literal placeholder the prompt uses for emptiness - quoted to the owner as if it were
  a finding.
- `README.md` was reported as possibly absent ("هل هو في جذر المستودع؟") while it sat at the root,
  429 lines of it.
- `/help` and a bare `/task` crashed on a not-null violation after sending their text three times,
  and the PostgREST error - table name, column name, failing row - was pasted into the chat.

Each of those is one architecture fact: a model with no tools can only describe what it cannot see,
and a dispatcher cannot see anything.

## The decision

A message is answered by `opencode run` in the `bridge` job of `.github/workflows/telegram.yml`:
one process per message, with the checkout, `.agents/skills`, a shell, the web, the Supabase MCP
server and the Vercel CLI, on `opencode-go/deepseek-v4.1-flash`.

There is no command. `/task`, `/now` and `/lookup` are gone: the sentence is the instruction, the
same way it is in Claude, ChatGPT and Gemini, which is the experience the owner asked for. `/remind`
and `/tz` are gone too - the agent understands "ذكرني بعد نصف ساعة" because it can call the same
`parseWhen` the command used, through the code it already has.

## What replaces the guarantees the commands provided

The commands were also guards, and removing them without replacements would be a trade of safety for
convenience. Four properties are now enforced by code, and each one is testable without a model:

1. **A message is answered once.** `telegram_messages.processed_at` is claimed with a compare-and-set
   before the turn starts, so the webhook's dispatch and the five-minute backstop cannot both answer
   it - or both open a pull request for it.
2. **The agent cannot write history, merge or deploy production.** `scripts/telegram/guard-decision.mjs`
   refuses `git commit|push|merge|rebase|reset|clean|stash`, `gh pr merge`, `gh issue close` and
   `vercel --prod`, through shims placed first in the agent's `PATH`; `AGENT_PUSH_TOKEN` is deleted
   from the environment the child receives; and the `bridge` job's own token is read-only for
   contents and pull requests. The push and the pull request are a step that runs after the turn,
   with a PAT, which is also why the branch gets checks at all (`GITHUB_TOKEN` pushes start no
   workflow).
3. **A merge needs two taps.** The bot's pull-request message carries `merge:<id>`; tapping it moves
   `telegram_confirmations.step` to 2 and rewrites the message into `merge2:<id>`; only that second
   tap dispatches the `merge` job, the only job with `contents: write`. A row is valid for thirty
   minutes, and the runner re-reads it rather than trusting the button.
4. **A failure speaks one sentence.** `failureLine` gives the owner a reference; the provider's own
   text goes to the run log. The not-null violation above is unreachable now, because
   `recordOutbound` refuses an empty body before it writes anything.

## Consequences

- **Latency is unbounded on purpose.** The owner's instruction was: let it read, think and work for
  as long as the work needs, and show what it is doing. A status message is sent immediately, edited
  with each tool call (`أقرأ config.mjs…`, `أبحث في المستودع…`), carries a stop button, and is
  deleted when the answer replaces it. The job ceiling is sixty minutes; a run that hits it says so.
- **Cost is per message, not per day.** An agent turn is more tokens than a completion. The owner
  chose quality; the idle-day cost is unchanged because pg_cron still wakes the bridge only when
  something is pending.
- **`gemini-4-argon` is gone** from both transcription paths (`AI_CHAT_TRANSCRIBE_MODELS` and the
  bridge), for cost. A note that cannot be transcribed is answered as a failure instead of silently
  paying a second model.
- **The bot writes the pull request, not just the issue.** The issue stays as the record - labelled
  `telegram`, deliberately not `ready-for-agent`, so the unattended pipeline does not merge the bot's
  work without the two taps. ADR 0120 keeps governing the issues the pipeline files itself.
- **One repository.** `GITHUB_TOKEN` reaches exactly one, and the bot refuses a sentence that names
  another rather than guessing at a credential it does not have.
- **The memory is visible.** `telegram_memories` rows are numbered in the context the agent receives,
  so "احذف رقم 3" is a deletion the owner can make and the bot can confirm; `parseForget` is the whole
  grammar, so the sentence cannot become an arbitrary `DELETE`.

## Considered options

- **Keep the dispatcher and fix the lookups.** Rejected: the lookup was the architecture. Grepping a
  checkout for the words in a question cannot answer "read this file", so the fix would have been a
  tool-use loop anyway, with none of the skill or MCP integration OpenCode already provides.
- **A hybrid fast lane for small talk.** Rejected for now: it reintroduces the tool-less path that
  produced the answers above, and the owner's stated preference is quality over latency. The status
  message is what makes the wait acceptable.
- **Give the agent the push token.** Rejected: a prompt is a request, and `AGENT_PUSH_TOKEN` is the
  one credential that writes a branch. It stays in the step after the turn.
- **Let the agent merge.** Rejected by the owner explicitly: two taps, and only from a button.

## What this supersedes

ADR 0121 in full. Its webhook-not-poll reasoning lives on in ADR 0122 and is unchanged; its
`/task` and `/now` lanes are replaced by the agent's own judgement plus the guard rails above.
