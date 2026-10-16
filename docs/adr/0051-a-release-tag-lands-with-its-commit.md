# A release tag lands with its commit

Three release runs failed on 2026-10-16 with `fatal: tag 'web-1.101.13' already
exists`, and the web train stopped releasing anything: every merge after #269 —
#270 through #278 — sat on `main` unreleased while the train failed the same way
every time.

The cause was one push, at 13:35, from a run that reported **success**. It created
its release commit, tagged it, and ran `git push origin main --tags`. That is not
one write: the tag was accepted and the branch was rejected — the log says
`* [new tag] web-1.101.13 -> web-1.101.13` followed by `push rejected (attempt
1)`, with no `main` update. The loop then did what it was written to do: rebase
onto `origin/main` and push again. The branch landed as a _different_ commit
(`35add62f`, on top of #271 rather than #269), while the tag stayed where the
first attempt had left it, on `906b5c99` — a commit `main` never contained.

Everything after that is consequence. `latestSemverTag` reads the tags _reachable
from HEAD_, and `906b5c99` is not an ancestor of `main`, so the train still
believed 1.101.13 was uncut. Each later run computed 1.101.13, spent two minutes
building, and died at `git tag`: the name was taken by a tag its version list
could not see. That is the version owed to a merge going missing in the opposite
direction from the one ADR-0046 describes — not a lost bump, but a bump that can
never advance.

**A number is owned by the tag that exists, not by the tag HEAD can reach.**
`--next` now counts from the higher of the last tag reachable from HEAD and the
highest tag that exists at all, so a tag a branch cannot see still spends its
number instead of being re-cut forever. The window graded is unchanged — the
commits since the last reachable tag, which is the only range an unreachable tag
can name. With no stranded tag the two bases are the same tag and nothing moves.

**The tag is created inside the retry loop, and pushed with the branch in one
transaction.** `git push --atomic` makes the two refs a single write: `main` and
the tag land together, or neither does. A rebase rewrites the commit, so the tag
is re-created on every attempt rather than once before the loop, which is what
keeps the retry from pushing a tag for the commit it just abandoned. The loop
also handles the case the arithmetic cannot rule out by itself — a tag that
appears on `origin` while this run holds the number, because another run cut it
first — and exits green with a warning: the number is spent, and the next change
on `main` releases whatever is left.

**A commit subject is graded with its invisible characters removed.** A squash
merge leaves U+FEFF in front of the subject when the message passes through a
Windows tool: `U+FEFFfeat(nav): …` (#277, and six more in the same window). That
is not `feat` to a `^feat` test, so the window graded a patch — the other half of
why the train insisted on the spent number. The bump rules now strip a leading
BOM/zero-width prefix before grading and before grouping changelog entries, which
also keeps the `[skip ci]` idempotency guard honest.

## Considered Options

- **Repointing the orphan tag at the release commit.**
  `git push --force origin web-1.101.13` would put the tag on `35add62f`, the
  content that actually shipped, and the train would move again. Rejected as the
  fix: it repairs one instance in a published tag, and the next non-atomic push
  strands another one. The version arithmetic moves the train past any such tag
  without touching history, and the atomic push stops creating them.
- **Failing loudly on a spent number.** Rejected: the edge case is two commits
  landing close together, and a red run for it is the complaint that started
  this. The warning names the tag, the reason is in the run summary, and what is
  owed goes out with the next landing.
- **Re-cutting a fresh version inside the loop on a collision** (`--apply` again,
  then `--amend`). Rejected for now: the notes file and the tag output would have
  to move through the loop and into the later steps, and it can only trigger where
  the arithmetic above already prevents it. If a real race shows up again, this is
  the shape of the next fix.
- **Deriving the bump from `package.json` instead of from the tags.** Rejected:
  it covers the same failure by changing what a version _means_ for every release,
  and the replay audit (`--replay`) grades release windows from tags.

## Consequences

The tag list and the version list agree by construction: a number is cut at most
once, and its tag is pushed with the branch that carries it or not at all. A tag
pushed without its commit is inert — it spends its number, and nothing else.

`web-1.101.13` stays where it is, naming `906b5c99`, and the GitHub release for it
keeps pointing at that commit. Nothing in the repository reads a tag's branch, so
nothing breaks; the tag is simply behind the next release. The release that
follows carries the whole stranded window — every commit since `web-1.101.12` —
which repeats the entries already listed under 1.101.13 once, in one changelog
section. One section of noise, in exchange for a train that moves.

The invariants are pinned where they can be read: the version base and the
subject normalization in `scripts/__tests__/release-tools.test.mjs`, the highest
tag that exists in `scripts/__tests__/git-utils.test.mjs`, and the shape of the
push — atomic, tagged inside the loop, a spent number exiting green — in
`scripts/__tests__/release-workflow.test.mjs`.
