# The manifest waits on main, not on a run

ADR-0046 decided the shell release commits `public/android/latest.json` only after the release
train has finished with its commit, because both workflows write to `main` and the train refuses
to push over a moved HEAD. It implemented "has finished with its commit" as a poll for a `Release`
run whose `headSha` was that commit. That poll cannot match, and it never has.

`Release` is triggered by `workflow_run` on `Code Quality`, and a run triggered that way reports the
default branch's tip as its `head_sha` — not `github.event.workflow_run.head_sha`, the field the
release workflow itself reads as the commit it tested. Measured on shell 1.0.12, 2026-10-20: the
shell release pushed `34e145d` at 11:49:56; the train it was waiting for was created at 11:54:09 and
cut `web-1.125.1` for `34e145d`, and the API reported that run as `0932f70` — the commit that landed
fifteen seconds after the shell's. The step logged `no release train run yet` forty-four times,
burned the whole fifteen-minute cap, and pushed the manifest at 12:07:25: a seventeen-minute job
holding about five minutes of work. Nothing failed, which is why it took a person noticing a job that
would not finish.

The same query has a second flaw worth naming: `head_sha` cannot tell one merge's train from
another's, so a wait that did match would settle on whichever run happened to share the SHA.

So the wait reads `main`. The train pushes its release commit on top of whatever is on `main` — its
push loop rebases until it lands, `--atomic` with its tag — so a `chore(release):` commit at the tip
means the train has cut every version owed below it, this merge included. The step fetches `main` at
depth 1 and reads the tip's subject every twenty seconds, and exits on the first release commit. No
run has to be identified, and the signal survives a train that skipped: the commit that superseded
this one brings its own release commit, above this merge.

The cap stays at fifteen minutes and still warns rather than fails, because a broken train must not
hold a shell release back. A merge that owes no version — a train that skips because HEAD is already
a release commit — never produces a release commit above it, so that case still ends at the cap; it is
rare, and the outcome, the manifest pushed anyway, is the correct one.

## Considered options

- **Keep matching on a run, but on the commit it tested.** Rejected: that SHA belongs to the
  triggering event, not to the run. The REST run object does not carry it (`referenced_workflows` is
  empty for these runs), so the only way to read it is the run's own log — one workflow grepping
  another's output to decide when it may write to `main`.
- **Wait for `Code Quality` on this commit, then for `Release` to be idle.** Rejected: more API calls,
  and still indirect — "no run is queued" is not "the version was cut", and the idle window it needs
  would be a guess.
- **Wait for `main` to move past this commit.** Rejected: in the case that matters it already has.
  `0932f70` landed fifteen seconds after the shell's commit, so the condition would pass instantly and
  the manifest would race the train again.
- **Drop the wait, since ADR-0052 made a manifest commit publish-only.** Rejected: that made the race
  harmless, not orderly. A manifest that lands ahead of the train lands inside the window the next
  version is cut from, and `chore(android): publish shell 1.0.12` then appears in that version's
  release notes.
- **Shorten the cap.** Rejected: the cap is not the defect. A wait with a working signal ends when the
  train does, in about three minutes; the cap only decides how long a broken signal is believed.

## Consequences

A shell release that overlaps a web release waits until that release commit lands, typically a few
minutes, and the manifest is the last writer as ADR-0046 intended. One that runs when `main` already
ends in a release commit exits on its first poll, so the ten-second no-op run that changes nothing
native still costs about ten seconds.

The wait no longer warns when the train fails: that was a conclusion read off a run this workflow can
no longer identify, and a stalled or red train is `release-health.yml`'s alarm (ADR-0052).

`scripts/__tests__/shell-release-workflow.test.mjs` pins the signal and the cap, so a future edit that
goes back to matching a run has to say why in that test.

The depth-1 fetch that reads the tip has a side effect the first version missed: in a checkout that is
already depth 1 it leaves `origin/main` a shallow root too, so HEAD and `origin/main` share no
ancestor. `Land the manifest` rebases onto `main`, and a rebase across an empty merge base replays the
commit the run checked out as well as the manifest. Shell 1.0.13 failed there, 2026-10-20: the rebase
tried to apply the run's own base, `feat(ui): render numbers…`, on top of the release commit that had
superseded it, conflicted on `CHANGELOG.md`, `package.json`, `package-lock.json` and
`backend/config/generated/app-version.ts`, and the manifest never landed although the asset was
already uploaded. A re-run would have failed the same way. The land step now unshallows `main` first —
guarded, because `--unshallow` refuses a complete repository — so the replay is the manifest commit
alone; the test file pins that order too.
