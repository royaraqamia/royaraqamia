/**
 * The one command for every registered generator's check (issue #1790).
 *
 * `generated.json` is the registry: a generator is either here with the files
 * it owns and the check that guards them, or in `buildOnly` with the reason it
 * needs no drift gate. `scripts/__tests__/generated-registry.test.mjs` fails
 * when a new `scripts/generate-*.mjs` lands without a row, so the next
 * generator cannot repeat the icon family's unchecked history.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(path.join(ROOT, 'generated.json'), 'utf8'));

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let failed = 0;
for (const entry of registry.generators) {
  console.log(`\n> ${entry.check}  (${entry.script})`);
  const match = /^npm run ([a-z0-9:-]+)$/.exec(entry.check);
  if (!match) {
    console.error(`  ${entry.script}: "${entry.check}" is not an npm script`);
    failed += 1;
    continue;
  }
  // Windows needs a shell to resolve npm.cmd; the script name is matched above,
  // so no arbitrary text can join this command line.
  const result = spawnSync(`${npm} run ${match[1]}`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (result.error) {
    console.error(`  ${entry.check}: ${result.error.message}`);
    failed += 1;
  } else if (result.status !== 0) {
    failed += 1;
  }
}

console.log(
  `\n${registry.generators.length - failed}/${registry.generators.length} generated families current`
);
process.exitCode = failed > 0 ? 1 : 0;
