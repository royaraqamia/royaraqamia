// Copies the Scanner's decoding engine out of `node_modules` into `public/`.
//
// Why a copy at all: `zxing-wasm` defaults to fetching its `.wasm` from a
// jsDelivr CDN URL, which our `script-src 'self'` CSP forbids and which would put
// a third party inside a page whose whole claim is privacy (ADR-0035). Serving it
// from our own origin also keeps it on the service worker's runtime cache path,
// so the Scanner keeps working offline.
//
// The binary is generated rather than committed, so it can never drift from the
// installed `zxing-wasm` version — which the library warns produces hard-to-read
// failures.
//
// Run by `predev` and `prebuild`.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm');
const CONSTANTS = join(ROOT, 'frontend', 'shared', 'constants.ts');

if (!existsSync(SOURCE)) {
  console.error(
    '[sync-zxing-wasm] node_modules/zxing-wasm is missing. Run `npm ci` before building.'
  );
  process.exit(1);
}

// The serve path is owned by the app (`SCANNER_WASM_PATH`), so read it from there
// instead of repeating it: a rename then cannot silently break the Scanner.
const declared = /SCANNER_WASM_PATH = '([^']+)'/.exec(readFileSync(CONSTANTS, 'utf8'))?.[1];
if (!declared) {
  console.error(
    '[sync-zxing-wasm] could not read SCANNER_WASM_PATH from frontend/shared/constants.ts.'
  );
  process.exit(1);
}

const TARGET = join(ROOT, 'public', declared.replace(/^\//, ''));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceHash = sha256(SOURCE);

if (existsSync(TARGET) && sha256(TARGET) === sourceHash) {
  console.log(`[sync-zxing-wasm] ${declared} is already current.`);
} else {
  mkdirSync(dirname(TARGET), { recursive: true });
  copyFileSync(SOURCE, TARGET);
  const megabytes = (statSync(TARGET).size / 1024 / 1024).toFixed(2);
  console.log(`[sync-zxing-wasm] wrote ${declared} (${megabytes} MB, sha256 ${sourceHash}).`);
}
