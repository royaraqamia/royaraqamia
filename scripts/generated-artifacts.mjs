/**
 * The two halves of the check for a generated-artifact family: strict arguments
 * and a byte-for-byte comparison against a fresh render.
 *
 * A generator that accepts `--check` must never write to the tree. Rendering
 * into a temporary directory is what makes that true for binary outputs too:
 * nothing in the checkout is opened for writing until the comparison is over —
 * and in check mode it never is (issue #1790).
 */
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const slash = (file) => file.split(path.sep).join('/');

/**
 * `--check` is the only flag either generator understands. Anything else is a
 * typo, and a typo that falls through to the write path would silently repair
 * the very drift a check is meant to report.
 */
export function parseGeneratorArgs(argv, usage) {
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown.join(', ')}. Usage: ${usage}`);
  }
  return { check: argv.includes('--check') };
}

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

/**
 * Every path the generator owns is either identical or reported, including a
 * deleted file and an output left behind by a size that no longer exists.
 *
 * `ownedDirs` is a list of `{ dir, include }`: a directory to walk and a
 * predicate on the repo-relative path, for finding those leftovers without
 * treating every other file in the directory as generated.
 */
export async function diffRendered({ rendered, committed, files, ownedDirs = [] }) {
  const owned = new Set(files.map(slash));
  const stale = [];
  for (const file of owned) {
    const expected = await readFile(path.join(rendered, file));
    let actual;
    try {
      actual = await readFile(path.join(committed, file));
    } catch (error) {
      if (error.code === 'ENOENT') {
        stale.push(`${file} (missing)`);
        continue;
      }
      throw error;
    }
    if (!actual.equals(expected)) stale.push(`${file} (differs)`);
  }
  for (const { dir, include } of ownedDirs) {
    for (const file of await walk(path.join(committed, dir))) {
      const relative = slash(path.relative(committed, file));
      if (!owned.has(relative) && include(relative)) stale.push(`${relative} (unexpected)`);
    }
  }
  return stale;
}

/** Render into a throwaway directory, compare, and always remove it. */
export async function checkRendered({ prefix, render, root, files, ownedDirs, label }) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    // The checkout already has these directories; a fresh temp tree does not.
    // Create them before rendering so a check never fails on a missing folder.
    for (const file of files) {
      await mkdir(path.join(directory, path.dirname(file)), { recursive: true });
    }
    await render(directory);
    const stale = await diffRendered({
      rendered: directory,
      committed: root,
      files,
      ownedDirs,
    });
    if (stale.length > 0) {
      process.stderr.write(
        `${label} are stale:\n${stale.map((file) => `  ${file}\n`).join('')}` +
          'Regenerate them and commit the result.\n'
      );
      return 1;
    }
    console.log(`${label} match the committed artifacts ✓`);
    return 0;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
