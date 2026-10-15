import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The release train refuses to cut a version for code it did not test: if `main`
 * moved while Code Quality ran, the newer commit's own pipeline releases it. That
 * rule has one exception, and the exception is how two web versions went missing
 * on 2026-10-15 — `Shell Release` lands its manifest commit with `GITHUB_TOKEN`,
 * which starts no workflows, so "the newer commit's own pipeline will release it"
 * is false for that commit and the abort means no version is ever cut for the
 * merge underneath it.
 *
 * A manifest publish is not untested code. It is data beside the app, written
 * after the tests ran and compiled from nothing. Every other move stays fatal,
 * because every other move is a commit whose own pipeline does release it.
 */
export const PUBLISH_ONLY_FILES = ['public/android/latest.json'];

function short(sha) {
  return String(sha ?? '').slice(0, 8);
}

/**
 * What a release run should do about the commit it tested.
 *
 * - `same` — nothing moved; release as usual
 * - `publish-only` — only the published manifest landed; release as usual
 * - `moved` — real code landed; that commit's own pipeline owns the release
 */
export function classifyHeadMove({ tested, current, changedFiles, isAncestor = true }) {
  if (tested === current) return { verdict: 'same' };

  if (!isAncestor) {
    return {
      verdict: 'moved',
      reason: `the tested commit ${short(tested)} is not an ancestor of ${short(current)}`,
    };
  }

  const unexpected = changedFiles.filter((file) => !PUBLISH_ONLY_FILES.includes(file));
  if (unexpected.length > 0) {
    return {
      verdict: 'moved',
      reason: `${short(current)} landed on top of the tested commit ${short(tested)}, touching ${unexpected.join(', ')}`,
    };
  }

  return { verdict: 'publish-only', changedFiles };
}

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

/**
 * Answers the question for a real repository and prints one line — the reason —
 * so the workflow can put it straight into its failure annotation.
 */
export function main(argv) {
  const flag = (name, fallback) => {
    const index = argv.indexOf(name);
    return index === -1 ? fallback : argv[index + 1];
  };

  const tested = flag('--tested');
  const current = flag('--current', 'HEAD');
  if (!tested) {
    console.log('usage: node scripts/release-guard.mjs --tested <rev> [--current <rev>]');
    return 1;
  }

  const testedSha = git(['rev-parse', `${tested}^{commit}`]);
  const currentSha = git(['rev-parse', `${current}^{commit}`]);
  if (!testedSha || !currentSha) {
    console.log(`could not resolve ${!testedSha ? tested : current} to a commit`);
    return 1;
  }

  const isAncestor =
    testedSha === currentSha ||
    git(['merge-base', '--is-ancestor', testedSha, currentSha]) !== null;
  const changedFiles =
    testedSha !== currentSha && isAncestor
      ? (git(['diff', '--name-only', `${testedSha}..${currentSha}`], '') ?? '')
          .split('\n')
          .filter(Boolean)
      : [];

  const move = classifyHeadMove({
    tested: testedSha,
    current: currentSha,
    changedFiles,
    isAncestor,
  });

  if (move.verdict === 'same') {
    console.log(`the tested commit ${short(testedSha)} is still HEAD`);
    return 0;
  }
  if (move.verdict === 'publish-only') {
    console.log(
      `HEAD moved to ${short(currentSha)}, but only by the published manifest (${PUBLISH_ONLY_FILES.join(', ')}); releasing ${short(testedSha)}`
    );
    return 0;
  }

  console.log(move.reason);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.log(`the guard could not run: ${error.message}`);
    process.exitCode = 1;
  }
}
