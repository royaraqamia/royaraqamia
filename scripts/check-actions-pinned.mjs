#!/usr/bin/env node
/**
 * Every `uses:` in a workflow is a dependency with the same immutability
 * problem as a lockfile entry. A tag or branch can be moved (or deleted) by
 * whoever owns the upstream repository, and the replacement runs with the
 * secrets the job already has -- including SUPABASE_ACCESS_TOKEN in the
 * database-backup job and SUPABASE_SERVICE_ROLE_KEY in the Telegram jobs.
 *
 * The repository pins almost every action to a full-length commit SHA by hand;
 * this is the gate that stops the next one from being added as `@v1`. It reads
 * the `uses:` at step level (`jobs.*.steps[*].uses`), the one at job level for
 * reusable workflows (`jobs.*.uses`), local `./` actions shipped with this
 * checkout, and `docker://` images pinned by immutable sha256 digest.
 *
 * No YAML parser or network: the value of a `uses:` is always a single line,
 * so a line scanner is enough and the check cannot go stale with a dependency.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKFLOWS_DIR = resolve('.github/workflows');
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const USES_LINE = /^\s*(?:-\s*)?uses:\s*(\S+)/;

/** Why a reference is not immutable, or null when it is. */
function problemWith(ref) {
  if (ref.startsWith('./')) return null; // local action, part of this checkout

  const parts = ref.split('@');
  if (ref.startsWith('docker://')) {
    return parts.length === 2 && IMAGE_DIGEST.test(parts[1])
      ? null
      : 'a docker:// reference must be pinned to an immutable sha256 digest';
  }
  if (parts.length !== 2) return 'expected exactly one @ separating the action from its pin';

  return COMMIT_SHA.test(parts[1])
    ? null
    : 'an action must be pinned to a 40-hex commit SHA, not a tag or branch';
}

/** Every unpinned reference in one workflow, with its line number. */
export function unpinnedUses(source, file = 'workflow.yml') {
  const violations = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const match = USES_LINE.exec(line);
    if (!match) return;
    const ref = match[1];
    const reason = problemWith(ref);
    if (reason) violations.push({ file, line: index + 1, ref, reason });
  });
  return violations;
}

/** Workflow files in a directory, in a stable order. */
export function workflowFiles(dir = WORKFLOWS_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort()
    .map((file) => join(dir, file));
}

export function main(argv = process.argv.slice(2), log = console.log) {
  if (argv.includes('--help')) {
    log('check-actions-pinned: fails when a workflow uses an external action by tag or branch.');
    return 0;
  }

  const files = argv.length > 0 ? argv : workflowFiles();
  const violations = files.flatMap((file) => unpinnedUses(readFileSync(file, 'utf8'), file));

  if (violations.length === 0) {
    log(`check-actions-pinned: every external uses in ${files.length} workflow(s) is immutable.`);
    return 0;
  }

  log(`check-actions-pinned: ${violations.length} unpinned action reference(s):`);
  for (const { file, line, ref, reason } of violations) {
    log(`  ${file}:${line}  ${ref}`);
    log(`    ${reason}`);
  }
  log('Pin each one to the full commit SHA its tag resolves to, keeping a trailing # vX comment.');
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('check-actions-pinned.mjs')) {
  process.exitCode = main();
}
