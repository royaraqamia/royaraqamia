/**
 * The decision behind the shared-tree guard: which shell commands are refused, and only in the
 * shared checkout. Kept free of plugin imports so it is ordinary, testable code.
 *
 * The rule it enforces lives in `docs/agents/worktrees.md`. The OpenCode wiring that calls it is
 * machine-local (`.opencode/` is gitignored), so this module is what a reinstall rebuilds around.
 */

/** Git's value-taking global options, so `git -C /x commit` still resolves `commit`. */
const VALUE_FLAGS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--config-env',
]);

/** Subcommands that write the shared index, or publish whatever else is in the tree. */
const WRITERS = new Set(['commit', 'push']);

export const DENY_MESSAGE =
  'Denied: land this in your own worktree, not the shared checkout - two writers here have already ' +
  'silently lost a commit. Create one (worktree_create, or `git worktree add -b <task> <dir> main`) ' +
  'and commit there. See docs/agents/worktrees.md.';

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** True when one command segment is a `git` invocation that writes. */
function segmentWrites(segment: string): boolean {
  const words = segment.trim().split(/\s+/);
  if (words[0] !== 'git') return false;
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    if (word === undefined) break;
    if (word.startsWith('-')) {
      // A value-taking flag consumes the next word, which is not the subcommand.
      if (VALUE_FLAGS.has(word)) i += 1;
      continue;
    }
    return WRITERS.has(word);
  }
  return false;
}

/** True when any command in a compound shell line writes. */
export function isWriterCommand(command: string): boolean {
  return command.split(/&&|\|\||[;\n|]/).some((segment) => segmentWrites(segment));
}

/** The reason to deny, or null to let the command through. */
export function decideDeny(input: {
  action: string;
  resources: readonly string[];
  sessionDirectory: string | null;
  canonicalDirectory: string;
}): string | null {
  if (input.action !== 'shell') return null;
  if (!input.resources.some((resource) => isWriterCommand(resource))) return null;
  // Unknown location, or a worktree: let it through rather than guess.
  if (input.sessionDirectory === null) return null;
  if (normalizePath(input.sessionDirectory) !== normalizePath(input.canonicalDirectory))
    return null;
  return DENY_MESSAGE;
}
