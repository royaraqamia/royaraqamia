import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The one git runner the scripts share. `fallback` is what a missing git (or a
 * command that cannot run) answers with, so a script run outside a checkout —
 * a tarball, a bare CI step — degrades instead of throwing.
 *
 * There is no tag parsing here any more: the web has no releases (ADR-0089), so
 * the only version a git tag carries is the Android shell's, and that lives in
 * scripts/android-shell-version.mjs beside the counter it belongs to.
 */
export function git(args, fallback) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}
