#!/usr/bin/env node
/* global process, console, setTimeout, clearTimeout, fetch, AbortSignal, Buffer */
/**
 * Noor coding runner v1 (ADR-0219).
 *
 * Executed by `assets/coding/noor-coding.yml` inside a GitHub-hosted Actions
 * job with the member's repository checked out. It has no npm dependencies and
 * no platform secret: the model is called through the control plane, and every
 * progress frame, decision and token count travels through the task-scoped HTTP
 * callback API with a short-lived bearer token.
 *
 * The workspace is disposable. The only durable output is a branch, one or more
 * checkpoint commits, and a pull request the member reviews. Nothing here ever
 * pushes to the base branch.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const API = (process.env.NOOR_API_URL ?? '').replace(/\/+$/, '');
const CALLBACK_TOKEN = process.env.NOOR_CALLBACK_TOKEN ?? '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const REPOSITORY = process.env.GITHUB_REPOSITORY ?? '';
const SPEC_JSON = process.env.NOOR_TASK_JSON ?? '';

const POLL_MS = 3_000;
const COMMAND_TIMEOUT_MS = 5 * 60_000;
const MAX_STEPS = 30;
const MAX_MESSAGES = 140;

const usage = { inputTokens: 0, outputTokens: 0 };

class RunnerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
  }
}

function scrub(value) {
  let text = String(value ?? '');
  if (CALLBACK_TOKEN) text = text.split(CALLBACK_TOKEN).join('[redacted]');
  if (GITHUB_TOKEN) text = text.split(GITHUB_TOKEN).join('[redacted]');
  if (HANDOFF_TOKEN) text = text.split(HANDOFF_TOKEN).join('[redacted]');
  return text;
}

function cap(value, limit) {
  return scrub(value).slice(0, limit);
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function loadSpec() {
  if (!API) throw new RunnerError('runner_failed', 'NOOR_API_URL is missing');
  if (!CALLBACK_TOKEN) throw new RunnerError('runner_failed', 'NOOR_CALLBACK_TOKEN is missing');
  if (!GITHUB_TOKEN) throw new RunnerError('runner_failed', 'GITHUB_TOKEN is missing');
  if (!REPOSITORY) throw new RunnerError('runner_failed', 'GITHUB_REPOSITORY is missing');
  if (!SPEC_JSON) throw new RunnerError('runner_failed', 'NOOR_TASK_JSON is missing');

  let spec;
  try {
    spec = JSON.parse(SPEC_JSON);
  } catch {
    throw new RunnerError('runner_failed', 'NOOR_TASK_JSON is not valid JSON');
  }
  if (!spec || typeof spec !== 'object') {
    throw new RunnerError('runner_failed', 'NOOR_TASK_JSON is not an object');
  }
  if (!spec.taskId || !spec.branch || !spec.baseBranch || !spec.caps || !spec.instruction) {
    throw new RunnerError('runner_failed', 'NOOR_TASK_JSON is missing required task fields');
  }
  if (spec.branch === spec.baseBranch || /^(main|master|develop)$/.test(spec.branch)) {
    throw new RunnerError('runner_failed', 'the task branch may not be the base branch');
  }
  return spec;
}

const spec = loadSpec();
// The workflow's GITHUB_TOKEN cannot create PRs in every repo configuration;
// the control plane supplies a short-lived installation token for this one act.
const HANDOFF_TOKEN = spec.handoffToken ?? '';
const deadlineMs =
  Date.now() + Math.min(Math.max(Number(spec.caps.runnerMinutes) || 15, 1), 60) * 60_000;

function timeLeftMs() {
  return Math.max(0, deadlineMs - Date.now());
}

function isActive(status) {
  return status === 'running' || status === 'queued';
}

/** One control-plane call. Errors name the route and status, never the token. */
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'noor-coding-runner/1',
      Authorization: `Bearer ${CALLBACK_TOKEN}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = cap((await response.text().catch(() => '')).slice(0, 500), 500);
    throw new RunnerError('runner_failed', `${path} answered ${response.status}: ${detail}`);
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new RunnerError('runner_failed', `${path} returned an unreadable body`);
  }
}

async function postUpdate(kind, status, summary, diff = null, failureCode = null) {
  await api('/api/coding/runner/update', {
    method: 'POST',
    body: {
      kind,
      status,
      summary: cap(summary, 20_000),
      diff: diff === null ? null : cap(diff, 200_000),
      failureCode,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  });
}

async function taskState() {
  return api('/api/coding/runner/task');
}

async function waitForDecision() {
  const end = Date.now() + Math.min(timeLeftMs(), 30 * 60_000);
  while (Date.now() < end) {
    const state = await taskState();
    if (state.decision === 'reject') return 'reject';
    if (state.decision === 'approve') return 'approve';
    // The control plane moves the task to awaiting_* while the member decides.
    // Those are waiting states, not terminal ones: keep polling until the
    // decision arrives instead of treating the gate itself as a stop.
    if (!isActive(state.status) && state.status !== 'awaiting_plan' && state.status !== 'awaiting_push') {
      return 'stopped';
    }
    await sleep(Math.min(POLL_MS, Math.max(0, end - Date.now())));
  }
  return 'timeout';
}

function budgetCheck() {
  if (Date.now() >= deadlineMs) {
    throw new RunnerError('budget_exhausted', 'runner time cap reached');
  }
  if (usage.inputTokens >= Number(spec.caps.maxInputTokens)) {
    throw new RunnerError('budget_exhausted', 'input token cap reached');
  }
  if (usage.outputTokens >= Number(spec.caps.maxOutputTokens)) {
    throw new RunnerError('budget_exhausted', 'output token cap reached');
  }
}

// ---------------------------------------------------------------------------
// Local tools
// ---------------------------------------------------------------------------

function safePath(value) {
  if (typeof value !== 'string' || !value) throw new Error('path must be a non-empty string');
  const root = process.cwd();
  const target = resolve(root, value);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('path escapes the workspace');
  }
  return target;
}

const MAX_FILE_BYTES = 200_000;

/** Read by attempt, not by check-then-read: the file can change between them. */
function readWorkspaceFile(target, label) {
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`file not found: ${label}`, { cause: error });
    }
    throw error;
  }
}

/**
 * The only write path in the runner. Model output is untrusted input, so it is
 * re-confined to the workspace and size-bounded at the moment of the write.
 */
function writeWorkspaceFile(target, label, text) {
  if (typeof text !== 'string') throw new Error('content must be a string');
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new Error('file is too large');
  safePath(relative(process.cwd(), target));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, { encoding: 'utf8', flag: 'w' });
  return label;
}

function walk(dir, files, limit) {
  if (files.length >= limit) return files;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    if (files.length >= limit) break;
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files, limit);
    else if (entry.isFile()) files.push(relative(process.cwd(), full).split(sep).join('/'));
  }
  return files;
}

function listFiles(args) {
  const start = args.path ? safePath(args.path) : process.cwd();
  const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 500);
  return { files: walk(start, [], limit) };
}

function readFile(args) {
  const target = safePath(args.path);
  const text = readWorkspaceFile(target, args.path);
  return { path: args.path, content: text.slice(0, 60_000), truncated: text.length > 60_000 };
}

function searchText(args) {
  if (typeof args.query !== 'string' || !args.query) {
    throw new Error('query must be a non-empty string');
  }
  const start = args.path ? safePath(args.path) : process.cwd();
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
  const needle = args.query.toLowerCase();
  const matches = [];
  for (const file of walk(start, [], 500)) {
    const full = safePath(file);
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.toLowerCase().includes(needle)) continue;
      matches.push(`${file}:${index + 1}: ${cap(line, 300)}`);
      if (matches.length >= limit) return { matches };
    }
  }
  return { matches };
}

function writeFile(args) {
  const target = safePath(args.path);
  writeWorkspaceFile(target, args.path, args.content);
  return { path: args.path, bytes: Buffer.byteLength(args.content, 'utf8') };
}

/** Apply a small unified diff, one hunk at a time, against the current file. */
function applyPatch(args) {
  if (typeof args.patch !== 'string' || !args.patch) {
    throw new Error('patch must be a unified diff string');
  }
  const lines = args.patch.replace(/\r\n/g, '\n').split('\n');
  let header = 0;
  let newPath = null;
  let oldPath = null;
  for (; header < lines.length; header++) {
    const line = lines[header] ?? '';
    if (line.startsWith('--- ')) oldPath = line.slice(4).trim();
    if (line.startsWith('+++ ')) {
      newPath = line.slice(4).trim();
      header++;
      break;
    }
    if (line.startsWith('@@')) break;
  }
  const named = newPath && newPath !== '/dev/null' ? newPath : oldPath;
  if (!named || named === '/dev/null') throw new Error('patch has no target file');
  const path = named.replace(/^b\//, '').replace(/^a\//, '');
  const target = safePath(path);
  const original = readWorkspaceFile(target, path);
  const trailingNewline = original.endsWith('\n');
  const source = original.split('\n');
  if (trailingNewline) source.pop();
  const result = [];
  let cursor = 0;

  for (let i = header; i < lines.length; ) {
    const line = lines[i] ?? '';
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (!hunk) {
      i++;
      continue;
    }
    const start = Number(hunk[1]);
    const insertAt = start === 0 ? 0 : start - 1;
    while (cursor < insertAt) {
      if (cursor >= source.length) throw new Error('patch hunk starts past end of file');
      result.push(source[cursor]);
      cursor++;
    }
    i++;
    for (; i < lines.length && !(lines[i] ?? '').startsWith('@@'); i++) {
      const row = lines[i] ?? '';
      if (row.startsWith('\\')) continue;
      const marker = row[0];
      const text = row.slice(1);
      if (marker === '+' || marker === ' ' || marker === '-') {
        const actual = source[cursor] ?? '';
        if (marker !== '+' && actual !== text) {
          throw new Error(`patch context mismatch at line ${cursor + 1}`);
        }
        if (marker !== '-') result.push(marker === '+' ? text : actual);
        if (marker !== '+') cursor++;
      } else if (row === '') {
        const actual = source[cursor] ?? '';
        if (actual !== '') throw new Error(`patch context mismatch at line ${cursor + 1}`);
        result.push('');
        cursor++;
      } else {
        throw new Error(`unsupported patch line: ${row.slice(0, 40)}`);
      }
    }
  }
  while (cursor < source.length) {
    result.push(source[cursor]);
    cursor++;
  }
  const next = result.join('\n') + (trailingNewline ? '\n' : '');
  writeWorkspaceFile(target, path, next);
  return { path, lines: result.length };
}

const ALLOWED_COMMANDS = new Set(['npm', 'npx', 'node', 'git', 'pnpm', 'yarn']);

function spawnCommand(command, args, { env = process.env, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, shell: false });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout = cap(stdout + chunk.toString(), 40_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = cap(stderr + chunk.toString(), 40_000);
    });
    child.on('error', (error) => {
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('close', (code) => {
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? 1, stdout: scrub(stdout), stderr: scrub(stderr) });
    });
  });
}

function restrictedEnv() {
  const childEnv = { ...process.env };
  delete childEnv.NOOR_CALLBACK_TOKEN;
  delete childEnv.GITHUB_TOKEN;
  delete childEnv.NOOR_TASK_JSON;
  return childEnv;
}

async function runCommand(args) {
  const command = args.command;
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`command not allowed: ${command}`);
  }
  const cmdArgs = Array.isArray(args.args) ? args.args : [];
  if (!cmdArgs.every((value) => typeof value === 'string')) {
    throw new Error('args must be an array of strings');
  }
  // Pushing is one deliberate act at handoff time, not a model tool call.
  if (command === 'git' && cmdArgs[0] === 'push') {
    throw new Error('git push is reserved for the final handoff');
  }
  return spawnCommand(command, cmdArgs, { env: restrictedEnv() });
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the checked-out repository, excluding .git and dependencies.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional relative directory.' },
          limit: { type: 'integer', description: 'Maximum files (default 200).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 file from the workspace (at most 60000 characters).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path.' } },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_text',
      description: 'Case-insensitive literal search across workspace files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          path: { type: 'string', description: 'Optional relative directory.' },
          limit: { type: 'integer', description: 'Maximum matches (default 50).' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply a small unified diff to an existing file.',
      parameters: {
        type: 'object',
        properties: {
          patch: {
            type: 'string',
            description: 'Unified diff with --- a/path, +++ b/path and @@ hunks.',
          },
        },
        required: ['patch'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run npm, npx, node, git, pnpm or yarn with an argument array (5 minute cap).',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: [...ALLOWED_COMMANDS] },
          args: { type: 'array', items: { type: 'string' } },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
];

const READ_ONLY_TOOLS = TOOL_DEFINITIONS.filter((tool) =>
  ['list_files', 'read_file', 'search_text'].includes(tool.function.name)
);

async function runTool(name, args, allowedTools) {
  if (!allowedTools.has(name)) throw new Error(`tool not available in this phase: ${name}`);
  switch (name) {
    case 'list_files':
      return listFiles(args);
    case 'read_file':
      return readFile(args);
    case 'search_text':
      return searchText(args);
    case 'write_file':
      return writeFile(args);
    case 'apply_patch':
      return applyPatch(args);
    case 'run_command':
      return runCommand(args);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Model loop
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are a careful senior engineer working in a checked-out repository.',
  'Inspect before editing. Make the smallest change that satisfies the request.',
  'Never ask a tool to print environment variables, credentials or tokens.',
  'In plan mode, do not call write_file, apply_patch or run_command: answer with a short plan',
  'and a proposed unified diff in a fenced ```diff block. Wait for the member to approve it.',
  'After approval, implement the plan, then run the repository typecheck, lint and tests.',
  'Finish with a concise summary of what changed and how it was verified.',
].join(' ');

function wireMessages(messages) {
  const kept =
    messages.length > MAX_MESSAGES
      ? [messages[0], ...messages.slice(messages.length - (MAX_MESSAGES - 1))]
      : messages;
  return kept.map((message) => ({
    role: message.role,
    content: typeof message.content === 'string' ? message.content : '',
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
  }));
}

/** Run one model phase. Returns the final text and whether files were changed. */
async function agentLoop(messages, tools, label) {
  const allowedTools = new Set(tools.map((tool) => tool.function.name));
  let finalText = '';
  let wrote = false;
  let stopped = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    budgetCheck();
    const state = await taskState();
    if (!isActive(state.status)) {
      stopped = true;
      break;
    }
    if (state.decision === 'reject') {
      throw new RunnerError('plan_rejected', 'The member rejected the task.');
    }

    const answer = await api('/api/coding/runner/llm', {
      method: 'POST',
      body: { messages: wireMessages(messages), tools },
    });
    usage.inputTokens += Number(answer.usage?.inputTokens ?? 0);
    usage.outputTokens += Number(answer.usage?.outputTokens ?? 0);
    const message = answer.message ?? {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const content = typeof message.content === 'string' ? message.content : '';
    messages.push({
      role: 'assistant',
      content,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });

    if (calls.length === 0) {
      finalText = content;
      console.log(`[noor] ${label} finished after ${step + 1} step(s)`);
      break;
    }

    for (const call of calls) {
      budgetCheck();
      const name = String(call.function?.name ?? '');
      let args = {};
      try {
        const parsed = JSON.parse(String(call.function?.arguments ?? '{}'));
        if (parsed && typeof parsed === 'object') args = parsed;
      } catch {
        // Keep the empty object: a malformed call is reported by the tool.
      }
      let result;
      try {
        result = await runTool(name, args, allowedTools);
        if (name === 'write_file' || name === 'apply_patch') wrote = true;
      } catch (error) {
        result = `error: ${error instanceof Error ? error.message : String(error)}`;
      }
      messages.push({
        role: 'tool',
        tool_call_id: String(call.id ?? `call-${step}`),
        content: cap(JSON.stringify(result), 200_000),
      });
      console.log(`[noor] ${label} tool ${name}: ${String(result).startsWith('error:') ? 'failed' : 'ok'}`);
    }
  }

  if (!stopped && !finalText) {
    throw new RunnerError('budget_exhausted', `runner stopped before ${label} produced an answer`);
  }
  return { finalText, wrote, stopped };
}

function proposedDiff(text) {
  const match = /```diff\r?\n([\s\S]*?)```/.exec(text);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Verification, checkpoints and handoff
// ---------------------------------------------------------------------------

function git(args) {
  return spawnCommand('git', args, {
    env: process.env,
    timeoutMs: 120_000,
  });
}

async function checkpoint(label) {
  await git(['add', '-A']);
  const status = (await git(['status', '--porcelain'])).stdout.trim();
  if (!status) return false;
  // The ephemeral runner has no git identity; commits fail without one.
  await git(['config', 'user.name', 'noor-coding-agent']);
  await git(['config', 'user.email', 'noor@royaraqamia.com']);
  const summary = `noor: ${label}`;
  const result = await git(['commit', '-m', summary]);
  if (result.exitCode !== 0) {
    throw new RunnerError('runner_failed', `checkpoint commit failed: ${result.stderr.slice(0, 200)}`);
  }
  return true;
}

async function verify() {
  let scripts = {};
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    scripts = pkg.scripts ?? {};
  } catch {
    // No package manifest: there is no repository-defined gate to run.
  }
  const names = ['typecheck', 'lint', 'test'].filter((name) => typeof scripts[name] === 'string');
  if (names.length === 0) {
    await postUpdate(
      'test',
      'applied',
      'No typecheck, lint or test scripts in this repository; nothing to run.',
      null,
      null
    );
    return;
  }
  const evidence = [];
  for (const name of names) {
    budgetCheck();
    const result = await spawnCommand('npm', ['run', name], {
      env: restrictedEnv(),
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    evidence.push(`$ npm run ${name}\nexit=${result.exitCode}\n${result.stdout}${result.stderr}`);
    if (result.exitCode !== 0) {
      await postUpdate('test', 'failed', cap(evidence.join('\n\n'), 20_000), null, 'checks_failed');
      throw new RunnerError('checks_failed', `npm run ${name} failed`);
    }
  }
  await postUpdate('test', 'applied', cap(evidence.join('\n\n'), 20_000), null, null);
  console.log(`[noor] verification passed: ${names.join(', ')}`);
}

async function createPullRequest(summaryText) {
  const [owner, name] = REPOSITORY.split('/');
  if (!owner || !name) throw new RunnerError('runner_failed', 'GITHUB_REPOSITORY is not owner/repo');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'noor-coding-runner/1',
    Authorization: `Bearer ${HANDOFF_TOKEN || GITHUB_TOKEN}`,
  };
  const created = await fetch(`${base}/pulls`, {
    method: 'POST',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      title: (spec.taskId || 'Noor coding task').slice(0, 200),
      head: spec.branch,
      base: spec.baseBranch,
      body: cap(summaryText || 'Automated coding task.', 20_000),
      draft: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (created.ok) {
    const payload = await created.json();
    if (!payload.html_url) throw new RunnerError('runner_failed', 'GitHub did not return a PR URL');
    return payload.html_url;
  }
  if (created.status !== 422) {
    throw new RunnerError('runner_failed', `pull request creation answered ${created.status}`);
  }
  // A retried dispatch may already have opened the pull request.
  const existing = await fetch(
    `${base}/pulls?head=${encodeURIComponent(`${owner}:${spec.branch}`)}&state=open`,
    { cache: 'no-store', headers, signal: AbortSignal.timeout(20_000) }
  );
  if (existing.ok) {
    const rows = await existing.json();
    if (Array.isArray(rows) && rows[0]?.html_url) return rows[0].html_url;
  }
  throw new RunnerError('runner_failed', `pull request creation answered ${created.status}`);
}

async function handoff(summaryText) {
  const committed = await checkpoint('checkpoint');
  await postUpdate(
    'commit',
    'applied',
    committed ? 'Checkpoint commit created.' : 'No file changes to commit.',
    null,
    null
  );

  const push = await git(['push', 'origin', `HEAD:${spec.branch}`]);
  if (push.exitCode !== 0) {
    throw new RunnerError('runner_failed', `git push failed: ${push.stderr.slice(0, 500)}`);
  }
  await postUpdate('push', 'applied', `Pushed ${spec.branch} to origin.`, null, null);

  const url = await createPullRequest(summaryText);
  await postUpdate('pull_request', 'applied', `Pull request: ${url}`, null, null);
  console.log(`[noor] pull request ${url}`);
}

// ---------------------------------------------------------------------------

async function main() {
  const firstState = await taskState();
  if (!isActive(firstState.status)) {
    console.log(`[noor] task already ${firstState.status}; nothing to do`);
    return;
  }
  if (firstState.decision === 'reject') {
    throw new RunnerError('plan_rejected', 'The member rejected the task.');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Task ${spec.taskId}: ${spec.instruction}\nBase branch: ${spec.baseBranch}\nTask branch: ${spec.branch}\nMode: ${spec.mode}`,
    },
  ];

  const plan = await agentLoop(messages, READ_ONLY_TOOLS, 'plan');
  if (plan.stopped) return;

  if (spec.mode === 'plan') {
    // A proposal is always posted before any write tool is available. Its diff
    // is the member's review surface; the digest of the work lands as a commit
    // only after approval.
    await postUpdate(
      'plan',
      'running',
      cap(plan.finalText || 'Proposed plan.', 20_000),
      proposedDiff(plan.finalText),
      null
    );
    console.log('[noor] plan proposed; waiting for approval');
    const verdict = await waitForDecision();
    if (verdict !== 'approve') {
      const code = verdict === 'reject' ? 'plan_rejected' : 'budget_exhausted';
      await postUpdate('plan', 'failed', `Plan not approved (${verdict}).`, null, code);
      throw new RunnerError(code, `Plan not approved (${verdict}).`);
    }
  }

  messages.push({
    role: 'user',
    content:
      spec.mode === 'plan'
        ? 'The plan was approved. Implement it now, then verify with the repository checks.'
        : 'Implement the request now, then verify with the repository checks.',
  });
  const edit = await agentLoop(messages, TOOL_DEFINITIONS, 'edit');
  if (edit.stopped) return;
  await postUpdate(
    'edit',
    'applied',
    cap(edit.finalText || `Changes made in ${spec.branch}.`, 20_000),
    null,
    null
  );

  await verify();

  // Local edit mode stops at the external-effect boundary. Full mode has that
  // escalation granted by its mode; plan mode has already been approved once.
  if (spec.mode === 'edit') {
    await postUpdate('push', 'running', 'Requesting approval to push and open a PR.', null, null);
    const verdict = await waitForDecision();
    if (verdict !== 'approve') {
      const code = verdict === 'reject' ? 'push_rejected' : 'budget_exhausted';
      await postUpdate('push', 'failed', `Push not approved (${verdict}).`, null, code);
      throw new RunnerError(code, `Push not approved (${verdict}).`);
    }
  }

  await handoff(edit.finalText);
  console.log('[noor] task complete');
}

try {
  await main();
} catch (error) {
  const code = error instanceof RunnerError ? error.code : 'runner_failed';
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[noor] ${code}: ${scrub(message).slice(0, 500)}`);
  await postUpdate('edit', 'failed', cap(message, 20_000), null, code).catch(() => undefined);
  process.exitCode = 1;
}
