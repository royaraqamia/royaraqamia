# 0184. A scheduled run is a turn without a witness

## Status

Accepted (program). Phase 4.

## Context

A member can ask the assistant to remember something for later. Today "later" is a habit's own
reminder field or a published post's schedule — the product's timer, not the agent's. The owner
wants the agent to schedule tasks for itself and reminders for the member, with autonomous
writes.

Every safety property of the interactive turn rests on one fact: a person is reading the card
before the effect happens. ADR-0113's whole design — propose, draw, confirm on the member's
session — is a check that requires a witness.

At 06:00 there is no witness. Whatever the run does, it does alone, with the member's own
authority and without their attention. So the run needs its own ceiling, its own budget, and its
own account of what it did.

## Decision

**A run is the same turn loop, with a synthetic context, a ceiling of tier 1, a budget, and a
digest.**

1. **The task is a row.** `agent_tasks(id, user_id, kind, prompt, schedule, timezone,
next_run_at, tier_ceiling, budget, status, last_run_at, last_result, created_by)` where `kind`
   is `reminder | digest | task`, `schedule` is a cron expression or a single instant, and
   `tier_ceiling` defaults to 1 and cannot exceed 1.

2. **Dispatch is a claim, not a loop.** One daily cron drains due rows (the Hobby deployment's
   cron granularity), claims each with `FOR UPDATE SKIP LOCKED` and a lease, and runs it. A run
   that dies releases its lease and is retried at most twice.

3. **The context is synthetic.** A run gets the identity block, memory and the task's prompt. It
   does not get a screen snapshot — there is no screen. It may not create a trust grant, connect
   an app, change a plan, invite a member, or send anything to a third party.

4. **The ceiling is enforced in the executor.** Tier 2 and 3 are refused inside a run, with a
   tool answer saying so. The system prompt says it too, but the prompt is the second defence
   (ADR-0180, decision 9).

5. **Every run leaves a digest.** One message in the assistant thread: what ran, what changed,
   and an undo for each reversible effect. A run that did nothing says so, because silence is
   indistinguishable from failure.

6. **The budget is three numbers** — tokens, tool calls, remote app calls — per run, per day, per
   member. A spent budget ends the run with a line in the digest, not an error.

7. **Two kill switches.** The member can pause every task they own. An operator flag stops all
   runs in the deployment, and the cron answers without claiming.

8. **A reminder is a run with no tools.** It delivers the member's own sentence at the time they
   chose. It is the first thing to ship because it needs nothing from the registry.

9. **Delivery is the thread and push.** In-app always; FCM when the member is away. No email
   until the deployment has a sender.

## Considered options

- **Autonomous writes at every tier.** Rejected: a run that publishes, pays or deletes without a
  witness is the failure this decision exists to prevent. It is also the one answer the mature
  products have not shipped.
- **Read-only runs.** Rejected: a digest that cannot record the thing the member asked for is a
  notification, not an assistant. Tier 1 is the useful middle.
- **A separate scheduler service.** Rejected: a table and a cron are enough at this scale, and a
  second runtime is a second deploy, a second secret set and a second failure mode.
- **Per-minute cron.** Rejected on the Hobby deployment's budget; the drain model keeps one call.
- **Letting the model decide the ceiling.** Rejected: the ceiling is the control, not a hint.

## Consequences

- Three schema objects: the task table, the lease, the run record.
- A daily cron route with its own `CRON_SECRET` check and its own budget line.
- The digest is a message in the existing agent thread, so no new surface is needed for "what did
  it do while I was away" — and the undo is the existing confirm machinery in reverse.
- A run's failures are visible to the member, not only to the operator.
- Tests: a task whose prompt asks to publish a post leaves a refusal and a digest line; a task
  with a spent budget stops after the budget and says so; a killed lease is retried twice and
  then marked failed.
