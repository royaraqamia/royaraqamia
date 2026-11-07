# 0136 — The agent doors answer by the same rules

Date: 2026-11-07

## Context

Three surfaces answer on the owner's behalf, and each keeps its own prompt:

- the terminal session reads `AGENTS.md` (`C:\Users\Asus\.config\opencode\AGENTS.md`
  is machine-local, the repository's own file is tracked);
- the Telegram bot builds its prompt in `scripts/telegram/prompt.mjs`;
- the product's assistant carries `SYSTEM_PROMPT` in
  `backend/services/chat/chat-agent-service.ts`.

They were written at different times for different audiences, so the rules
drifted. The terminal had a terse-response section; the Telegram prompt asked
for short paragraphs; the assistant said "بإيجاز". The same request therefore
came back at three different lengths depending on where it was asked, and the
only record of that was the owner noticing. Nothing failed, because nothing
compared them.

The assumption rule drifted harder, and it matters more: the terminal can stop
and ask, while the bot and the assistant answer in one turn. A rule written for
one door ("ask before acting") is unusable at another that has no second turn,
and a rule written loosely ("be careful") is unusable everywhere.

## Decision

**The rules are data in one file, each door picks a language and a sentence cap,
and a gate fails the pull request when a door stops carrying a line.**

1. **`shared/contracts/agent-behaviour.mjs` is the source.** One line per rule,
   in English and Arabic, plus one sentence cap per door. It is `.mjs` because
   the Telegram prompt is loaded by plain Node with no build step and this
   repo's scripts import nothing from `backend/` or `shared/`; a module both the
   bundler and the script can load is the seam that costs no new tooling.

2. **The caps differ by door: 3 sentences on the terminal, 4 on the bot and the
   assistant.** The terminal answers the owner, who wants the answer; a member
   asking the product's assistant may need a sentence of explanation. One cap
   for all three either truncates the member or lets the terminal ramble.

3. **"Never assume silently", not "never act without asking".** A guess that is
   cheap to undo is named in one clause and acted on; a guess that is expensive
   — `git` writes, deploy, delete, publish, spend, user-facing copy, schema — is
   a question instead. The bot and the assistant are single-turn and each run is
   metered ([ADR-0133](0133-agent-spend-is-measured-per-run.md)), so "ask and
   stop on everything" would cost a run per clarification and answer the owner
   with a question. The product's write tools already require the member's tap;
   this keeps the prompt on the same line as the architecture.

4. **`npm run check:agent-behaviour` is the gate.** It compares the terminal's
   `AGENTS.md` and the built Telegram prompt against the shared lines, and
   requires the assistant to import the shared module instead of restating it.
   The assistant's prompt is TypeScript, so its content is asserted in
   `chat-agent-service.test.ts`. A rule edited on one door and not the others
   fails `Code Quality`.

5. **The evidence line is the one exception to "no closing summary".** The bot
   reports what changed and which check ran, because that is a receipt, not a
   summary; its prompt says so explicitly so the rule does not delete it.

## Consequences

- The machine-local terminal config is outside the repository and cannot be
  gated. The tracked `AGENTS.md` carries the English lines; the machine-local
  file is kept in step by hand, and the check would catch a divergence only if
  the repository file is the one edited.
- The shared module is data, not a prompt: a door still decides where the lines
  sit, so the section a rule lands in can differ while its wording cannot.
- The Arabic lines are subject to `check:fusha` and `check:arabic` like any
  other copy, so a dialect word added to the shared file fails the same gate a
  canned reply would.
- A door that gains a new rule gets it by adding one entry to the file; the
  gate reports the missing `id`, not a diff of the prompt.
