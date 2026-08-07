import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// We point Turbopack's build output at the SSD via a Windows junction (`.next`
// -> C:). That relocates the compiled chunk files, so Turbopack's runtime
// `require('@tailwindcss/postcss')` can no longer resolve the project's
// `node_modules` by walking up the directory tree. Setting NODE_PATH restores
// that fallback for the dev worker only (production builds are unaffected).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = resolve(root, 'node_modules');
const nextBin = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBin, 'dev', '--turbopack'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_PATH: nodeModules },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
