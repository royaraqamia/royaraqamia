# The release train has a dead-man's switch

The release guard refuses to cut a version for history the run did not test: when
`main` moves while Code Quality runs, the newer commit's own pipeline releases it
(ADR-0046). Until now "refuses" meant "fails", so every pair of commits that
landed close together left a red release run for the older one — and the red run
was a lie about the state of the train: nothing was missing. A release cuts every
commit since the last tag, so the newer commit's run covers the older one too.
Recounted on 2026-10-16, the version cut for that day's stall — `web-1.102.0` —
lists every commit from #271 to #279, including the ones whose own runs had
aborted.

So the guard now answers with four verdicts instead of three, and the run acts on
the answer:

- `same` / `publish-only` — release as usual
- `superseded` — a newer commit owns this version; **skip green**, and say so
- `rewritten` — the tested commit is not an ancestor of `HEAD` at all, so the
  history this run tested is not the history it would release; **fail**

The skip is folded into the one `skip` output the run already had, so every step
below it is still governed by a single condition, and the reason reaches the log
and the run summary as a notice.

`same` and `publish-only` print `skip=false` on the first stdout line, `superseded`
prints `skip=true`, and the verdict that cannot be acted on prints the reason alone
and exits non-zero — which is what the failure annotation carries.

**And because a skip is now silent, something has to miss the version out loud.**
The guard's rule has the hole ADR-0046 already found once: a commit whose push
starts no workflows has no pipeline of its own, so "the newer commit's pipeline
will release it" is false for it — a `[skip ci]` commit, or a token push with real
code in it. Nothing in the repository noticed that, which is how the train of
2026-10-16 stayed stalled from 13:36 to 16:19 — two hours and forty minutes in
which every merge from #272 to #278 went unreleased, and nothing to look at but a
failed push.

`.github/workflows/release-health.yml` is the switch. Every fifteen minutes it asks
`scripts/release-health.mjs` one question: above the newest release commit, is
there a commit that owes a version — ignoring the ones that only republish the
shell manifest, which owe nothing (ADR-0046) — and has the _oldest_ of them stood
for more than thirty minutes? If it has, no release run is coming for it, and one
alert issue opens with the count, the commit it has been owed since, and links to
the commits and the release runs. The issue is updated while the backlog stands
and closed by the first run that finds the train level again.

The age that decides is the oldest owed commit's, not the newest: on a busy `main`
commits keep arriving, so the tip is always young while the backlog grows — which
is exactly what the stall looked like. Thirty minutes is two release cycles
(`Code Quality` plus `Release`, measured at about six minutes), so a healthy train
never trips it.

## Considered Options

- **Keeping the red run for `superseded`.** Rejected: it is the complaint that
  started this, and a failing run is the wrong place for the fact — the version is
  not missing, it was already going to be cut.
- **Having the monitor re-dispatch the train.** Rejected: a failed `Release` run is
  usually a build failure or a push that could not be rebased, and re-dispatching
  turns one broken merge into a red run every fifteen minutes. The alert names the
  run to re-run for exactly the cases where a retry would work, and leaves the
  decision with whoever can read the failure.
- **Watching only for failed `Release` runs.** Rejected: a run that never starts
  cannot report that it never started, which is the failure a dead-man's switch
  exists for.
- **Skipping silently, with the red run as the only signal.** Rejected: it is the
  hole ADR-0046 documents, one layer up — the run that should have released the
  commit is not the run that failed, and nothing would say so.

## Consequences

A release run that lost the race is green and its log says why. The alarm for a
train that is behind lives in one place, is a single issue rather than a stream of
red runs, and survives a schedule that lands late: a version owed by an hour can
afford a late alarm.

Measured against that stall, this workflow would have opened its alert at about
14:10 — thirty minutes after #272 landed — and held it, through every merge that
followed it, until the release at 16:19 turned it green again. Instead the train
sat for two hours and forty minutes and was noticed by a person reading a failed
run.

The monitor's threshold is a judgement, not a measurement — thirty minutes, in the
script beside the rule it belongs to, overridable with `--stale-minutes` for a
retrospective. A `main` whose `Code Quality` takes longer than that would raise a
false alarm, which the next run closes; a release run that ends up green an hour
late is a slower problem than a lost version, and this trades the second for the
first.

The workflow needs `issues: write` and nothing else, and it never writes to the
repository.
