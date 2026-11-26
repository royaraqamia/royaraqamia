#!/usr/bin/env node
/* global process, console, setTimeout, fetch, AbortSignal, URL */
/**
 * Noor local companion (ADR-0222, ADR-0219 phase 2).
 *
 * The member grants one folder on this device. The folder's path, its files and
 * any credential live here; the control plane stores a device label and the
 * digest of a revocable grant token. The companion polls for queued tasks, then
 * runs the same dependency-free runner the Actions job uses, in local mode: it
 * works in the folder, leaves an uncommitted diff and never pushes.
 *
 * Commands:
 *   pair <code> [--label <name>] [--folder <path>] [--api <url>]
 *   run [--once] [--folder <path>]
 *   info
 *   unpair
 *
 * Config: ~/.noor/config.json (mode 600). Nothing here is uploaded.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = join(homedir(), '.noor');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
/**
 * The runner is downloaded once, beside this script, by the command the page
 * prints. The companion never fetches or writes executable code itself: a CLI
 * that silently replaced what it runs would be a remote-code door on the
 * member's own machine, and the runner is versioned by URL anyway.
 */
const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const POLL_MS = 10_000;

const VERSION = '1';

function usage() {
  console.log(`Noor local companion v${VERSION}

  node noor-local.mjs pair <code> --api <url> [--label <name>] [--folder <path>]
  node noor-local.mjs run --api <url> [--once] [--runner <path>]
  node noor-local.mjs info
  node noor-local.mjs unpair

The pairing code is created in the coding page, expires in ten minutes and is
spent the first time a device claims it. Keep this tool inside the folder it
was paired with: the folder is the grant. The runner (runner-v1.mjs) must sit
beside this script; the page prints both downloads.`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0] ?? '', positional: positional.slice(1), flags };
}

function readConfig() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.token || !raw.folder) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`[noor] config written to ${CONFIG_PATH}`);
}

function requireFolder(value) {
  const folder = resolve(value || process.cwd());
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error(`folder does not exist: ${folder}`);
  }
  return folder;
}

function isGitFolder(folder) {
  return existsSync(join(folder, '.git'));
}

async function request(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': `noor-local-companion/${VERSION}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text().catch(() => '');
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object'
        ? String(payload.error ?? payload.message ?? '')
        : text.slice(0, 200);
    throw new Error(`${method} ${new URL(url).pathname} answered ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return payload;
}

async function pair({ positional, flags }) {
  const code = positional[0];
  const api = String(flags.api ?? process.env.NOOR_API_URL ?? '').replace(/\/+$/, '');
  if (!code) throw new Error('a pairing code is required');
  if (!/^https?:\/\//.test(api)) throw new Error('--api <origin> is required, e.g. https://example.com');

  const folder = requireFolder(typeof flags.folder === 'string' ? flags.folder : process.cwd());
  if (!isGitFolder(folder)) {
    throw new Error('the folder must be a git repository: review and rollback both use its diff');
  }

  const label = String(flags.label ?? basename(folder)).slice(0, 80);
  const claimed = await request(`${api}/api/coding/local/pairs/claim`, {
    method: 'POST',
    body: { code, deviceLabel: label },
  });
  if (!claimed || !claimed.token || !claimed.grant) {
    throw new Error('the server did not return a device grant');
  }

  writeConfig({
    apiUrl: String(claimed.apiUrl ?? api).replace(/\/+$/, ''),
    token: claimed.token,
    grantId: claimed.grant.id,
    workspaceId: claimed.grant.workspaceId,
    deviceLabel: label,
    folder,
    pairedAt: new Date().toISOString(),
  });
  console.log(`[noor] paired "${label}" with ${folder}`);
  console.log(`[noor] start it with: node noor-local.mjs run --api ${api}`);
}

function runTask(runnerPath, spec, apiUrl, folder) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: folder,
      env: {
        ...process.env,
        NOOR_API_URL: apiUrl,
        NOOR_CALLBACK_TOKEN: spec.callbackToken,
        NOOR_TASK_JSON: JSON.stringify(spec),
      },
      stdio: 'inherit',
    });
    const forward = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    const onInterrupt = () => forward('SIGINT');
    process.once('SIGINT', onInterrupt);
    child.on('error', (error) => {
      process.removeListener('SIGINT', onInterrupt);
      rejectPromise(error);
    });
    child.on('close', (code) => {
      process.removeListener('SIGINT', onInterrupt);
      resolvePromise(code ?? 1);
    });
  });
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function run({ flags }) {
  const config = readConfig();
  if (!config) throw new Error('this device is not paired; run the pair command first');
  // The origin is named on the command line, not read from the config file: a
  // credential file should never also choose where the credential is sent.
  const api = String(flags.api ?? process.env.NOOR_API_URL ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(api)) throw new Error('--api <origin> is required, e.g. https://example.com');
  if (!existsSync(config.folder) || !statSync(config.folder).isDirectory()) {
    throw new Error(`the paired folder is missing: ${config.folder}`);
  }
  if (!isGitFolder(config.folder)) {
    throw new Error('the paired folder is no longer a git repository');
  }

  const runnerPath = resolve(typeof flags.runner === 'string' ? flags.runner : join(SELF_DIR, 'runner-v1.mjs'));
  if (!existsSync(runnerPath)) {
    throw new Error(
      `runner not found at ${runnerPath}; download it beside this script: curl -fsSL ${api}/coding/runner-v1.mjs -o "${runnerPath}"`
    );
  }

  console.log(`[noor] waiting for tasks as "${config.deviceLabel}" in ${config.folder}`);
  console.log('[noor] the folder stays on this device; Ctrl+C stops the companion.');

  const once = flags.once === true;
  for (;;) {
    let task = null;
    try {
      task = await request(`${api}/api/coding/local/tasks/claim`, {
        method: 'POST',
        token: config.token,
      });
    } catch (error) {
      console.error(`[noor] ${error instanceof Error ? error.message : String(error)}`);
      if (once) throw error;
    }

    if (task && task.spec) {
      const code = await runTask(runnerPath, task.spec, api, config.folder);
      console.log(`[noor] task finished with exit code ${code}`);
      if (once) return;
    } else if (once) {
      console.log('[noor] no task is waiting');
      return;
    }

    await sleep(POLL_MS);
  }
}

function info() {
  const config = readConfig();
  if (!config) {
    console.log('[noor] this device is not paired');
    return;
  }
  console.log(`device:    ${config.deviceLabel}`);
  console.log(`folder:    ${config.folder}`);
  console.log(`origin:    ${config.apiUrl}`);
  console.log(`workspace: ${config.workspaceId ?? '—'}`);
  console.log(`paired at: ${config.pairedAt ?? '—'}`);
  console.log('revoke it from the coding page; the token stays valid until you do.');
}

function unpair() {
  writeConfig({
    // Overwrite with an empty record rather than delete: a stale token is a
    // credential, and a missing file is indistinguishable from never paired.
    unpairAt: new Date().toISOString(),
  });
  console.log('[noor] local config cleared. Revoke the device on the coding page too.');
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help === true || command === 'help' || command === '--help') {
    usage();
    return;
  }
  switch (command) {
    case 'pair':
      await pair({ positional, flags });
      return;
    case 'run':
      await run({ flags });
      return;
    case 'info':
      info();
      return;
    case 'unpair':
      unpair();
      return;
    default:
      usage();
      process.exitCode = command ? 1 : 0;
  }
}

try {
  await main();
} catch (error) {
  console.error(`[noor] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
