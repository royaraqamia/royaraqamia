/**
 * The merge, and the two taps in front of it.
 *
 * The owner's rule: work the bot did can reach main, but only after confirming
 * twice. Two separate taps on two separate buttons is as close to "twice" as a
 * phone gets, and the state lives in `telegram_confirmations` so the second tap
 * can arrive in a different workflow run from the first.
 *
 * Nothing here runs on a schedule or on a sentence. The only caller is a button.
 */

import { githubTarget } from './config.mjs';
import { github } from './http.mjs';
import { completeConfirmation, findConfirmation } from './store.mjs';

export const MERGE_METHOD = 'squash';

/** Where a tap leaves the confirmation, in one place so the edge function and the runner agree. */
export function nextStep(current) {
  if (current.step === 1) return { step: 2, done: false };
  if (current.step === 2) return { step: 2, done: true };
  return { step: current.step, done: false };
}

/**
 * Merges the pull request a confirmed row points at.
 *
 * Checked rather than trusted: the row names a number, the API answers for that
 * number, and a pull request that is not open is reported instead of assumed
 * merged. The head branch is deleted afterwards because nothing else points at
 * it; the commit stays on main either way.
 */
export async function mergeConfirmed({ confirmationId, onLog = () => {} }) {
  const row = await findConfirmation(confirmationId);
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.expired) return { ok: false, reason: 'expired' };
  if (row.kind !== 'merge') return { ok: false, reason: 'kind' };
  if (row.step < 2) return { ok: false, reason: 'unconfirmed' };

  const { owner, repo } = githubTarget();
  const number = Number(row.target);
  const pull = await github(`/repos/${owner}/${repo}/pulls/${number}`);
  if (!pull) {
    await completeConfirmation(confirmationId, 'missing');
    return { ok: false, reason: 'missing' };
  }
  if (pull.merged) {
    await completeConfirmation(confirmationId, 'already');
    return { ok: true, pull, already: true };
  }
  if (pull.state !== 'open') {
    await completeConfirmation(confirmationId, 'closed');
    return { ok: false, reason: 'closed', pull };
  }

  const result = await github(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      merge_method: MERGE_METHOD,
      commit_title: `${pull.title} (#${number})`,
      // The branch's own reasoning is the body, the same as a human merge.
      commit_message: String(pull.body ?? '').slice(0, 1000),
    }),
  }).catch((error) => {
    onLog(`merge failed: ${error.message}`);
    return null;
  });

  if (!result?.merged) {
    await completeConfirmation(confirmationId, 'failed');
    return { ok: false, reason: 'failed', pull };
  }

  await completeConfirmation(confirmationId, 'merged');
  await github(`/repos/${owner}/${repo}/git/refs/heads/${pull.head.ref}`, {
    method: 'DELETE',
  }).catch(() => {});

  // `Closes #N` in the body is a request, not a guarantee: GitHub recorded the
  // cross-reference for #1049 and left the issue open when the merge came through
  // the API. Closing it here makes the record true whichever way it merged.
  const linked = /closes\s+#(\d+)/i.exec(String(pull.body ?? ''));
  if (linked) {
    await github(`/repos/${owner}/${repo}/issues/${linked[1]}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    }).catch((error) => onLog(`closing #${linked[1]} failed: ${error.message}`));
  }

  return { ok: true, pull, already: false, closedIssue: linked ? Number(linked[1]) : null };
}
