# The interactive agent merges the pull request its own commit opened

ADR 0048 gave the Issue Implementer the landing loop. `/oc` kept the half of it that stops at an open
pull request, so a `/oc` task still needed the person who asked for it to come back and merge. This
extends 0048 to it, and answers the one question 0048 did not have to: which pull request is _this_
run's.

The implementer can answer that with "the newest open `opencode/*` pull request that was not open
when the run started". `/oc` cannot. Its concurrency group is per comment, so two runs can be in
flight at once, and "newest" lets one of them merge the other's branch. Instead the workflow
snapshots every open `opencode/*` pull request and its head commit before the implement phase, and
afterwards names the branch whose head commit did not exist then, or has moved since. The tip is the
identity because the implement phase is what moves it: a run that opened a pull request created a
branch that was not in the snapshot, and a run triggered on an existing agent pull request — a review
comment on its branch — pushed to one that was.

The rest is 0048's loop, with the same reasons: the title is normalized before the checks are
watched, because a rejected title is a red check; `gh pr checks --watch` runs to a 40-minute cap and
a failure never merges; the merge is `--squash --delete-branch`, and it runs with `RELEASE_TOKEN`
rather than `GITHUB_TOKEN`, because a merge made with the default token starts no workflows and the
push to `main` would skip Code Quality and with it Release. The agent still runs no `git` command and
never holds the merge.

## Considered options

- **The newest open `opencode/*` pull request not seen at the start**, which is what the implementer
  does. Rejected here: that is only unambiguous because its workflow is guarded to one run a day, and
  `/oc` runs are not.
- **Serializing every `/oc` run into one concurrency group.** Rejected: GitHub keeps one pending run
  per group and cancels it when another arrives, so a queued request could be dropped silently — a
  worse failure than the one it removes.
- **Asking the action for the pull request number.** Not available: the pinned action declares no
  outputs, so the number has to be inferred.
- **Merging only when the trigger was a comment on a pull request.** Rejected: `/oc` on an issue is
  the common case, and it is the one that opens the pull request.
- **Merging on `always()`, even when the implement phase failed.** Rejected: a phase that failed
  after pushing can leave a half-finished branch, and a person should see that rather than have it
  merged. The merge runs only when the implement phase reports success.

## Consequences

A `/oc` task now reaches `main` without the person who asked for it reading the diff. The boundaries
0048 leaned on hold here too — only collaborators with write access can trigger a run, and the pull
request passes every check before it merges — so what is removed is the read, not the tests.

Two cases are deliberately left to a person rather than resolved: more than one `opencode/*` branch
changed while the run was in flight, and a run whose pre-run snapshot was not recorded. Both report
why on the triggering thread and leave the pull request open.

One case is accepted rather than eliminated: a run that changed nothing and therefore opened no pull
request of its own can still see a concurrent run's branch as the one that moved, and will merge it.
The window is the length of a run, it needs two `/oc` runs overlapping, and the outcome is bounded —
the branch is merged only when its checks are green, which is the merge the other run was about to
make anyway. Closing it properly means the action reporting the pull request it touched, which is an
upstream change, not a workflow one.
