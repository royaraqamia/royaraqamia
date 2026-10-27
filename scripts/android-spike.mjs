#!/usr/bin/env node
/**
 * Packs the bundled surface into the Android shell (issue #500).
 *
 * The spike boots `https://localhost` instead of loading the live site, so the
 * app needs the opposite of what `npm run android:apk` produces: `server.url`
 * unset and the Vite build in `webDir`. Capacitor's CLI has one config file per
 * project (`cap sync` takes no `--config`), and the shipped shell's config is
 * the committed one, so this script performs the two writes `cap copy` would
 * have performed, from `capacitor.config.spike.json`:
 *
 *   1. `capacitor-web/spike/**` -> `android/app/src/main/assets/public/**`
 *   2. `capacitor.config.spike.json` -> `android/app/src/main/assets/capacitor.config.json`
 *
 * Both destinations are generated and git-ignored, and `npm run android:sync`
 * puts the shipped shell back. Nothing about the release path changes; the
 * script refuses to run if a release build is what someone actually wanted.
 *
 * Usage: node scripts/android-spike.mjs   (after `npm run spike:build`)
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPIKE_DIST = join(ROOT, 'capacitor-web', 'spike');
const SPIKE_CONFIG = join(ROOT, 'capacitor.config.spike.json');
const ASSETS = join(ROOT, 'android', 'app', 'src', 'main', 'assets');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!existsSync(join(SPIKE_DIST, 'index.html'))) {
  fail('capacitor-web/spike/index.html is missing — run `npm run spike:build` first.');
}

const config = JSON.parse(readFileSync(SPIKE_CONFIG, 'utf8'));
if (config.server?.url) {
  fail('capacitor.config.spike.json must not set `server.url`: the spike boots a bundled origin.');
}

const publicDir = join(ASSETS, 'public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(SPIKE_DIST, publicDir, { recursive: true });

// `server.errorPath` is resolved inside `webDir`, and that page lives beside the
// shipped shell's `webDir` rather than inside Vite's `public/`.
const unavailable = join(ROOT, 'capacitor-web', 'unavailable.html');
if (existsSync(unavailable)) cpSync(unavailable, join(publicDir, 'unavailable.html'));

writeFileSync(
  join(ASSETS, 'capacitor.config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
  'utf8'
);

process.stdout.write(
  'The native project now loads the bundled spike surface. `npm run android:sync` restores the live-site shell.\n'
);

const build = spawnSync(process.execPath, [join(ROOT, 'scripts', 'android.mjs'), 'apk'], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
