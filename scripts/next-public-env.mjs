import { readFileSync } from 'node:fs';

/**
 * The `process.env` values Next inlines into the app bundle, for the bundles
 * this repository builds with esbuild by hand (`sw-outbox.js`, `sync-flush.js`).
 *
 * A browser has no `process`, so a module that reads `NEXT_PUBLIC_*` at import
 * time — `frontend/shared/constants` does, and anything reaching the Supabase
 * browser client reaches it — threw `ReferenceError: process is not defined`
 * the moment the worker or the shell's drain page evaluated it (#1125). Next
 * substitutes these at build time; these bundles have to substitute the same
 * ones or they are not the same code.
 *
 * The values come from the process first and `.env` second, which is the order
 * Next itself uses. A missing value is `''`, exactly as Next's own fallback
 * would leave it: the point is that the module evaluates, not that every value
 * is present in a realm that never reads it.
 */

/** `KEY=value` lines, quotes stripped, never overwriting a real environment. */
function loadEnvFile(path = '.env') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

/** The `define` map both scripts hand to `esbuild.build`. */
export function nextPublicDefines() {
  loadEnvFile();

  const define = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_')) define[`process.env.${key}`] = JSON.stringify(value ?? '');
  }
  define['process.env.NODE_ENV'] = JSON.stringify(process.env.NODE_ENV ?? 'production');
  // The catch-all for a key neither list knows: esbuild prefers the longest
  // match, so the defines above still win, and a stray read becomes `undefined`
  // instead of a `ReferenceError` on a global a browser does not have.
  define['process.env'] = '{}';
  return define;
}
