/**
 * Which command a message may not run.
 *
 * Pure on purpose: the shim that enforces it is generated from this function, and
 * the tests call it directly rather than through a shell. The rule is narrow -
 * the writes that cannot be undone from the chat - because `git log`, `gh pr
 * view` and `vercel ls` are how the agent answers honestly.
 */

export const GUARDED_TOOLS = ['git', 'gh', 'vercel'];

export function decide(tool, argv = []) {
  const args = argv.map((value) => String(value));
  const first = args[0] ?? '';

  if (tool === 'git') {
    const mutating = [
      'commit',
      'push',
      'merge',
      'rebase',
      'reset',
      'revert',
      'cherry-pick',
      'tag',
      'am',
      'apply',
    ];
    if (mutating.includes(first)) {
      return {
        allow: false,
        reason: `git ${first} writes history; the bot opens a pull request instead`,
      };
    }
    if (first === 'branch' && args.some((arg) => arg === '-d' || arg === '-D' || arg === '-m')) {
      return {
        allow: false,
        reason: 'deleting or renaming a branch is not something a message may do',
      };
    }
    if (first === 'checkout' && args.includes('-f')) {
      return { allow: false, reason: 'git checkout -f discards work' };
    }
    if (first === 'clean') {
      return { allow: false, reason: 'git clean deletes untracked files' };
    }
    if (first === 'stash' && args[1] !== 'list' && args[1] !== 'show') {
      return { allow: false, reason: 'git stash moves work out of the tree' };
    }
    return { allow: true };
  }

  if (tool === 'gh') {
    const joined = args.join(' ');
    if (/^pr\s+(merge|close)\b/.test(joined)) {
      return { allow: false, reason: "merging needs the owner's two taps, not a command" };
    }
    if (/^(release|repo)\s+delete\b/.test(joined)) {
      return { allow: false, reason: 'deletion is not something a message may do' };
    }
    if (/^issue\s+(delete|close)\b/.test(joined)) {
      return { allow: false, reason: "closing or deleting an issue is the owner's call" };
    }
    return { allow: true };
  }

  if (tool === 'vercel') {
    const joined = args.join(' ');
    if (/(^|\s)--prod(\s|$)/.test(joined)) {
      return {
        allow: false,
        reason: 'a production deploy needs the owner to ask for it explicitly',
      };
    }
    if (/^(remove|rm|env\s+rm|domains\s+rm)\b/.test(joined)) {
      return { allow: false, reason: 'removing a deployment, variable or domain is irreversible' };
    }
    return { allow: true };
  }

  return { allow: true };
}
