#!/usr/bin/env bash
# Watch a pull request's checks and merge it when every one of them is green.
#
# ADR 0120: the workflow is the gate, because `main` carries no branch protection. A
# repository-level auto-merge would fire the moment the pull request opened, and forcing
# the same checks through protection would gate every human pull request on a rule nobody
# wrote for them. So the order is fixed here: watch, then merge the exact commit it
# watched, squash only, and never delete the branch a later conflict resolution may need.
#
# Usage: land-pull-request.sh <number>
# Writes `status` (green, merged or red) and `reason` (when red) to $GITHUB_OUTPUT.
set -uo pipefail

pr="${1:?a pull request number is required}"
out="${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

write() { printf '%s=%s\n' "$1" "$2" >>"$out"; }

# A pull request that was just opened has no checks on it yet, and `gh pr checks` answers
# an empty rollup with a failure exit code rather than a wait, so wait for the first
# check to register before watching.
for _ in $(seq 1 30); do
  count=$(gh pr view "$pr" --json statusCheckRollup --jq '[.statusCheckRollup[]] | length')
  if [ "$count" -gt 0 ]; then break; fi
  sleep 10
done

timeout 2400 gh pr checks "$pr" --watch --interval 20
code=$?

if [ "$code" -ne 0 ]; then
  if [ "$code" -eq 124 ]; then
    reason="The checks on #$pr did not finish within 40 minutes."
  else
    failing=$(gh pr checks "$pr" 2>/dev/null |
      awk -F'\t' '$2 == "fail" || $2 == "pending" { print $1 }' | paste -sd, -)
    reason="A check on #$pr did not pass: ${failing:-see the pull request}."
  fi
  write status red
  write reason "$reason"
  echo "::warning title=Checks are not green::$reason"
  exit 0
fi

write status green

# A green pull request the agent did not report as implemented is not merged: the agent is
# the one that read the acceptance criteria, so its `cannot` wins over a coincidentally
# green check run.
if [ -f /tmp/result.json ] && ! grep -q 'implemented' /tmp/result.json; then
  echo "The agent did not report this issue implemented; leaving #$pr for a person."
  exit 0
fi

head=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
if gh pr merge "$pr" --squash --match-head-commit "$head" >/dev/null; then
  sleep 5
  state=$(gh pr view "$pr" --json state --jq .state)
  if [ "$state" = "MERGED" ]; then
    write status merged
    echo "Merged pull request #$pr; its Closes line closes the issue."
    exit 0
  fi
  write status red
  write reason "Pull request #$pr is green but stayed $state after the merge was requested."
  exit 0
fi

write status red
write reason "Pull request #$pr is green and the merge was refused; it needs a person."
