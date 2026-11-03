# The chat escalates instead of guessing

The bridge answers a plain message with one model call: no tools, no checkout, no network. That is
what makes it feel like a conversation — two seconds, not two minutes — and it is also the reason the
first live replies could not answer "why does this check fail?" or "what changed in that file?". The
owner asked for a bot that can look things up without being told a command, which is a question about
where the decision to look lives.

It lives in the model. `deepseek-v4.1-flash` supports tool calling, so the answer route is offered one
tool, `lookup`, with `source: repo | web`. When it wants evidence it asks for it; when it does not, it
answers immediately. Nothing inspects the text for keywords, and no command is required.

## What happens when it escalates

1. The model returns a tool call instead of a reply.
2. The bridge writes one row to `telegram_lookups` and tells the owner it is checking.
3. The next run gathers the evidence: `repo` greps the checkout the runner already has, `web` fetches
   the URL it was given or the search page for a phrase.
4. The evidence goes to the model as data, with the instruction to answer from it and to say so when
   it is not enough.

The answer therefore arrives in a second message, a minute or two later, and it can cite a path or a
link because it read one.

## Why not send everything to the agent

Every message would cost a workflow run and a few minutes, including "مرحبا". The agent path already
exists for work — `/task`, `/now`, the planner, the implementer — and it is the right shape for
changing a repository. A question is not a change.

## Why the evidence is gathered by a script, not by an agent loop

A grep and a fetch are deterministic, bounded and cheap; an agent loop costs several calls per
question and can wander. The honest limit is that a `repo` lookup is a search, not a browsing session:
it returns the lines that matched, and the model must say when that is not enough. Raising that limit
means handing the question to `/task`-style machinery, which is a different promise.

## The side effects, written down

- **Two messages** when it escalates: the acknowledgement, then the answer.
- **A workflow run** per escalated question, and a minute or two of latency.
- **A wrong guess in both directions**: a conversation question may escalate (cheap), and an evidence
  question may be answered without escalation (the one worth guarding against — hence the tool
  description says explicitly when to use it).
- **Voice notes** are transcribed before routing, with `mimo-v2.6-flash`, because
  `deepseek-v4.1-flash` takes text and images but no audio. The transcript then follows the same path,
  so a spoken `/task` is a task.
