#!/usr/bin/env node
/**
 * The headless runner's OpenCode config, rendered from one committed file
 * (ADR-0142).
 *
 * The config used to be a JSON heredoc inside the composite action, which made
 * it invisible to every gate the repository has: it could not be diffed in a
 * pull request, and nothing could assert what it allowed. It lives in
 * `.github/opencode/runner.json` now, the action renders it, and
 * `scripts/agents/runner-permissions.mjs` proves no permission prompt is
 * reachable with it.
 *
 * Only the Supabase project reference is injected, because it is the one value
 * that comes from a workflow input rather than from the file.
 *
 * Usage:
 *   node scripts/agents/runner-config.mjs            # print the rendered config
 *   node scripts/agents/runner-config.mjs --write    # write it where the CLI reads it
 *
 * `--write` refuses to run outside GitHub Actions: on a developer machine the
 * target is the owner's own OpenCode config, and an agent has no business
 * rewriting that.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The committed config, before the one value a workflow input supplies. */
export const TEMPLATE = join(ROOT, '.github', 'opencode', 'runner.json');

/** The only placeholder the template carries. */
export const PLACEHOLDER = '__SUPABASE_PROJECT_REF__';

/** Where the CLI reads the config on a runner (`~/.config/opencode/opencode.json`). */
export function configPath(home = process.env.HOME || homedir()) {
  return join(home, '.config', 'opencode', 'opencode.json');
}

/** The template as text, so a caller can prove the placeholder survived. */
export function readTemplate() {
  return readFileSync(TEMPLATE, 'utf8');
}

/** The template parsed, for the permission check. */
export function readConfig() {
  return JSON.parse(readTemplate());
}

/** The template with the project reference substituted. */
export function render(ref) {
  if (!ref) throw new Error('SUPABASE_PROJECT_REF is not set');
  const text = readTemplate();
  if (!text.includes(PLACEHOLDER)) throw new Error(`${TEMPLATE} no longer carries ${PLACEHOLDER}`);
  return text.replaceAll(PLACEHOLDER, ref);
}

function main(argv) {
  const ref = (process.env.SUPABASE_PROJECT_REF ?? '').trim();

  if (!argv.includes('--write')) {
    process.stdout.write(render(ref));
    return;
  }

  // A runner is the only place the target path is disposable. Anywhere else it
  // is the developer's own config, which this script must never touch.
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('--write only runs on a GitHub runner; run without it to print the config');
  }

  const target = configPath();
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, render(ref));
  process.stdout.write(`wrote ${target}\n`);
}

if (process.argv[1] && /runner-config\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`runner-config: ${error.message}`);
    process.exit(1);
  }
}
