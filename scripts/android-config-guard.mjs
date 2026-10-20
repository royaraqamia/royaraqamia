#!/usr/bin/env node
/**
 * Refuses a release shell that would open its WebView to `chrome://inspect`.
 *
 * `capacitor.config.ts` enables WebView debugging whenever `NODE_ENV` is not
 * `production`, which is what a developer wants from `android:apk`. The release
 * and publish paths force `NODE_ENV=production` before `cap sync`, and then ask
 * this module to read the config Capacitor actually generated. The generated
 * file is the thing Gradle bundles, so it — not the environment the build ran
 * in — decides what ships: a manually run `cap sync`, an inherited `NODE_ENV`
 * or a config copied from a debug tree stops the build here instead of handing
 * users an inspectable WebView (issue #398).
 *
 * Absent or `false` is fine: Capacitor's own default is off. Anything else is
 * refused, including a string that is truthy in JavaScript.
 *
 * Usage: node scripts/android-config-guard.mjs [--path <capacitor.config.json>]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where `cap sync android` writes the config the APK bundles. */
export const GENERATED_CONFIG = join(ROOT, 'android/app/src/main/assets/capacitor.config.json');

/**
 * Is the WebView open to inspection? Only an explicit `false` (or no setting at
 * all) counts as off — an unreadable value must not be read as safe.
 */
export function webViewDebuggingEnabled(config) {
  const android = config?.android;
  if (!android || typeof android !== 'object') return false;
  const value = android.webContentsDebuggingEnabled;
  return value !== undefined && value !== false;
}

/**
 * Reads the generated config and throws unless it keeps the WebView closed.
 * Returns the parsed config so a caller can log what it approved.
 */
export function assertWebViewDebuggingOff({
  path = GENERATED_CONFIG,
  label = 'a release build',
} = {}) {
  if (!existsSync(path)) {
    throw new Error(
      `No generated Capacitor config at ${path}.\n` +
        `${label} needs the config \`cap sync\` writes, so it can prove the WebView is closed.\n` +
        'Generate it with production on:\n' +
        '  cross-env NODE_ENV=production npm run android:sync\n' +
        '(`npm run android:release`, `android:aab` and `android:publish` do that for you.)'
    );
  }

  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(
      `${path} is not readable JSON (${error.message}).\n` +
        'A config this refuses to parse is a config this cannot clear for release:\n' +
        're-generate it with `cross-env NODE_ENV=production npm run android:sync`.'
    );
  }

  if (webViewDebuggingEnabled(config)) {
    throw new Error(
      'The generated Capacitor config still enables WebView debugging:\n' +
        `  ${path}\n` +
        `  android.webContentsDebuggingEnabled = ${JSON.stringify(
          config.android.webContentsDebuggingEnabled
        )}\n` +
        'A release build must not be inspectable through chrome://inspect.\n' +
        'Run the build through `npm run android:release`, `npm run android:aab` or `npm run android:publish`:\n' +
        'they sync with NODE_ENV=production. Do not ship a config copied from a debug tree.'
    );
  }

  return config;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const at = process.argv.indexOf('--path');
  const path = at === -1 ? GENERATED_CONFIG : resolve(process.argv[at + 1]);

  try {
    assertWebViewDebuggingOff({ path });
    process.stdout.write(`WebView debugging is off: ${path}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
