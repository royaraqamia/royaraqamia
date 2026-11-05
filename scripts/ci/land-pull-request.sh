#!/usr/bin/env bash
# Watch a pull request's checks and merge it when every one of them is green.
#
# ADR 0120: the workflow is the gate, because `main` carries no branch protection. A
# repository-level auto-merge would fire the moment the pull request opened, and forcing
# the same checks through protection would gate every human pull request on a rule nobody
# wrote for them. So the order is fixed here: watch, then merge the exact commit it
# watched, squash only, and never delete the branch a later conflict resolution may need.
#
# The issue the merge names is closed afterwards: `Closes #N` in the body is a request the
# API merge does not honour (#1061), so the record is made true here instead.
#
# The three states this has to tell apart are not "green", "red" and "pending" - they are
# "measured and green", "measured and red" and "never measured". The third is the one that
# used to be reported as the first: a pull request that conflicts with `main` has no merge
# ref, so GitHub runs no workflow on it and its rollup holds only the skipped Supabase
# integration check; an empty watch agrees with itself, and the merge is then refused with
# "the merge commit cannot be cleanly created" long after the round could have repaired it.
#
# Usage: land-pull-request.sh <number>
# Writes `status` (green, merged, red or none) and `reason` (unless green or merged) to
# $GITHUB_OUTPUT.
set -uo pipefail

pr="${1:?a pull request number is required}"
out="${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

write() { printf '%s=%s\n' "$1" "$2" >>"$out"; }

red() {
  write status red
  write reason "$1"
  echo "::warning title=Checks are not green::$1"
  exit 0
}

# Checks that actually measured something. Supabase's integration reports a skipped check
# on every pull request whether or not a workflow ran, so a rollup made only of skipped and
# neutral entries is not a green pull request - it is a pull request nothing looked at.
substantive_checks() {
  local count
  count=$(gh pr view "$pr" --json statusCheckRollup --jq '
    [ .statusCheckRollup[]
      | select((((.conclusion // .state // "") | test("^(SKIPPED|NEUTRAL)$")) | not)) ]
    | length' 2>/dev/null) || count=0
  printf '%s' "${count:-0}"
}

# `mergeable` is computed lazily, so the first answer after a push is UNKNOWN; ask until
# GitHub has decided rather than reading the unknown as clean.
mergeable() {
  local state=UNKNOWN
  for _ in $(seq 1 12); do
    state=$(gh pr view "$pr" --json mergeable --jq .mergeable 2>/dev/null) || state=UNKNOWN
    case "$state" in
      UNKNOWN | '') sleep 5 ;;
      *) break ;;
    esac
  done
  printf '%s' "$state"
}

# `Closes #N` in a pull request body is a request, not a guarantee: GitHub recorded the
# cross-reference for #1049 and left the issue open when the merge came through the API,
# while the same request merged in the web UI closes it. Closing the linked issues here
# makes the record true whichever way it merged. The links are GitHub's own record
# (`closingIssuesReferences`), not a regex over the body, so `Fixes`, `Resolves` and a
# body edited after the request opened are all covered.
#
# Nothing here may fail the landing: the merge has already happened, and an issue that is
# already closed, sits in another repository or is not an issue at all is bookkeeping,
# not a reason to report a red round.
close_linked_issues() {
  local repo slug number state url links closed=''
  repo="${GITHUB_REPOSITORY:-}"
  [ -n "$repo" ] || repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || repo=''

  links=$(gh pr view "$pr" --json closingIssuesReferences \
    --jq '.closingIssuesReferences[] | "\(.repository.owner.login)/\(.repository.name) \(.number)"' \
    2>/dev/null) || links=''

  if [ -z "$links" ]; then
    echo "No issue is linked to #$pr; there is nothing to close."
    return 0
  fi

  while read -r slug number; do
    [ -n "$number" ] || continue
    if [ -n "$repo" ] && [ "$slug" != "$repo" ]; then
      echo "Linked #$number belongs to $slug, not $repo; leaving it open."
      continue
    fi
    url=$(gh issue view "$number" --json url --jq .url 2>/dev/null) || url=''
    case "$url" in
      */issues/"$number") ;;
      *)
        echo "Linked #$number is not an issue in $repo; leaving it alone."
        continue
        ;;
    esac
    state=$(gh issue view "$number" --json state --jq .state 2>/dev/null) || state=''
    if [ "$state" = "CLOSED" ]; then
      echo "Linked issue #$number was already closed."
    elif gh issue close "$number" --reason completed >/dev/null 2>&1; then
      closed="${closed:+$closed, }#$number"
    else
      echo "Linked issue #$number was not closed; leaving it open."
    fi
  done <<<"$links"

  [ -z "$closed" ] || echo "Closed $closed."
  return 0
}

if [ "$(mergeable)" = "CONFLICTING" ]; then
  red "Pull request #$pr conflicts with main, so its checks cannot run until that is resolved."
fi

# A pull request that was just opened has no checks on it yet, and `gh pr checks` answers
# an empty rollup with a failure exit code rather than a wait, so wait for the first
# substantive check to register before watching.
for _ in $(seq 1 30); do
  if [ "$(substantive_checks)" -gt 0 ]; then break; fi
  sleep 10
done

if [ "$(substantive_checks)" -eq 0 ]; then
  red "No check ran on #$pr, so nothing measured it and there is nothing to merge on."
fi

timeout 2400 gh pr checks "$pr" --watch --interval 20
code=$?

if [ "$code" -ne 0 ]; then
  if [ "$code" -eq 124 ]; then
    red "The checks on #$pr did not finish within 40 minutes."
  fi
  failing=$(gh pr checks "$pr" 2>/dev/null |
    awk -F'\t' '$2 == "fail" || $2 == "pending" { print $1 }' | paste -sd, -)
  red "A check on #$pr did not pass: ${failing:-see the pull request}."
fi

write status green

# A green pull request the agent did not report as implemented is not merged: the agent is
# the one that read the acceptance criteria, so its `cannot` wins over a coincidentally
# green check run.
if [ -f /tmp/result.json ] && ! grep -q 'implemented' /tmp/result.json; then
  write reason "The agent did not report #$pr implemented; green alone does not merge it."
  echo "The agent did not report this issue implemented; leaving #$pr for the next round."
  exit 0
fi

# The base can move while the checks run - an earlier round merges the plan file this one
# also touches - and a pull request that becomes conflicted mid-watch would otherwise be
# merged against a tree that no longer exists.
if [ "$(mergeable)" = "CONFLICTING" ]; then
  red "Pull request #$pr became conflicted with main while its checks ran."
fi

head=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
if ! merge_error=$(gh pr merge "$pr" --squash --match-head-commit "$head" 2>&1); then
  red "The merge of #$pr was refused: $(printf '%s' "$merge_error" | tr '\n' ' ' | cut -c1-240)"
fi

sleep 5
state=$(gh pr view "$pr" --json state --jq .state)
if [ "$state" = "MERGED" ]; then
  write status merged
  echo "Merged pull request #$pr."
  close_linked_issues
  exit 0
fi

red "Pull request #$pr is green but stayed $state after the merge was requested."
