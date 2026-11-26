#!/usr/bin/env node
/* global process, console, setTimeout, clearTimeout, fetch, AbortSignal, Buffer */
/**
 * Noor coding runner v1 (ADR-0219, ADR-0223).
 *
 * Executed by `assets/coding/noor-coding.yml` inside a GitHub-hosted Actions
 * job with the member's repository checked out. It has no npm dependencies and
 * no platform secret: the model is called through the control plane, and every
 * progress frame, decision and token count travels through the task-scoped HTTP
 * callback API with a short-lived bearer token.
 *
 * The workspace is disposable. The only durable output is one branch per
 * repository in the task's set, a checkpoint commit per repository, and a pull
 * request per repository that the member reviews. Nothing here ever pushes to a
 * base branch.
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
const MAX_REVIEW_DIFF = 120_000;

const usage = { inputTokens: 0, outputTokens: 0 };
// Assigned from the spec below. Declared here so an early failure can still be
// scrubbed and reported without touching a temporal-dead-zone binding.
let HANDOFF_TOKEN = '';

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
  if (!spec.taskId || !spec.instruction || !spec.caps) {
    throw new RunnerError('runner_failed', 'NOOR_TASK_JSON is missing required task fields');
  }
  if (spec.kind === 'local') {
    // A local task runs inside a folder the member granted on this device: no
    // repository, no installation token and no remote to push to.
    return spec;
  }
  if (!GITHUB_TOKEN) throw new RunnerError('runner_failed', 'GITHUB_TOKEN is missing');
  const repos = Array.isArray(spec.repos) ? spec.repos : [];
  if (repos.length === 0 && spec.repoOwner && spec.repoName && spec.baseBranch && spec.branch) {
    // A task dispatched before per-repository rows existed carries the single
    // repository in the old fields. Read it as a one-entry set rather than
    // failing work that was already running when this runner was deployed.
    spec.repos = [
      {
        owner: spec.repoOwner,
        name: spec.repoName,
        fullName: `${spec.repoOwner}/${spec.repoName}`,
        baseBranch: spec.baseBranch,
        branch: spec.branch,
        dir: `repos/${spec.repoOwner}/${spec.repoName}`,
      },
    ];
  }
  if (!Array.isArray(spec.repos) || spec.repos.length === 0) {
    throw new RunnerError('runner_failed', 'NOOR_TASK_JSON has no repository set');
  }
  for (const repo of spec.repos) {
    if (!repo || !repo.owner || !repo.name || !repo.branch || !repo.baseBranch) {
      throw new RunnerError('runner_failed', 'NOOR_TASK_JSON has an incomplete repository');
    }
    if (repo.branch === repo.baseBranch || /^(main|master|develop)$/.test(repo.branch)) {
      throw new RunnerError('runner_failed', 'the task branch may not be the base branch');
    }
  }
  return spec;
}

const spec = loadSpec();
const LOCAL = spec.kind === 'local';
const REPOS = LOCAL ? [] : Array.isArray(spec.repos) ? spec.repos : [];
// The workflow's GITHUB_TOKEN cannot create PRs in every repo configuration;
// the control plane supplies a short-lived installation token for this one act.
HANDOFF_TOKEN = spec.handoffToken ?? '';
// One checkout stays cwd-relative; two or more are cloned under a workspace
// root so repository paths never collide.
const MULTI = !LOCAL && REPOS.length > 1;
const deadlineMs =
  Date.now() + Math.min(Math.max(Number(spec.caps.runnerMinutes) || 15, 1), 60) * 60_000;

let ASKPASS_PATH = '';

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

async function postUpdate(kind, status, summary, diff = null, failureCode = null, extra = {}) {
  await api('/api/coding/runner/update', {
    method: 'POST',
    body: {
      kind,
      status,
      summary: cap(summary, 20_000),
      diff: diff === null ? null : cap(diff, 200_000),
      repo: extra.repo ?? null,
      failureCode,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      model: extra.model ?? null,
      latencyMs: extra.latencyMs ?? null,
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
const LOCAL_BLOCKED_GIT = new Set([
  'add',
  'branch',
  'checkout',
  'cherry-pick',
  'clean',
  'commit',
  'merge',
  'push',
  'rebase',
  'reset',
  'restore',
  'revert',
  'stash',
  'switch',
  'tag',
]);

function spawnCommand(
  command,
  args,
  { env = process.env, timeoutMs = COMMAND_TIMEOUT_MS, cwd = process.cwd() } = {}
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env, shell: false });
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
  delete childEnv.HANDOFF_TOKEN;
  delete childEnv.NOOR_GIT_TOKEN;
  delete childEnv.GIT_ASKPASS;
  return childEnv;
}

/** The token reaches git through askpass, never through a command line or URL. */
function gitEnv() {
  return {
    ...process.env,
    GIT_ASKPASS: ASKPASS_PATH,
    GIT_TERMINAL_PROMPT: '0',
    NOOR_GIT_TOKEN: HANDOFF_TOKEN,
  };
}

/** The git subcommand, skipping `-C <path>` and `-c key=value` options. */
function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const value = String(args[i] ?? '');
    if (value === '-C' || value === '-c' || value === '--git-dir' || value === '--work-tree') {
      i++;
      continue;
    }
    if (value.startsWith('-')) continue;
    return value;
  }
  return '';
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
  // Pushing is one deliberate act at handoff time, not a model tool call. The
  // subcommand is parsed, not read from position 0: `git -C repo push` is the
  // same external effect as `git push`.
  if (command === 'git' && gitSubcommand(cmdArgs) === 'push') {
    throw new Error('git push is reserved for the final handoff');
  }
  // A local task's review surface and rollback both depend on the folder's
  // history and index being untouched: the member's own commit is the decision.
  if (LOCAL && command === 'git' && LOCAL_BLOCKED_GIT.has(gitSubcommand(cmdArgs))) {
    throw new Error(`git ${gitSubcommand(cmdArgs)} is not available in a local folder task`);
  }
  return spawnCommand(command, cmdArgs, { env: restrictedEnv() });
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the workspace, excluding .git and dependencies.',
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

function repoMap() {
  if (LOCAL) return 'Folder: the granted folder on this device.';
  if (!MULTI) return `Repository: ${REPOS[0]?.fullName ?? REPOSITORY}.`;
  return [
    'This task spans several repositories, checked out side by side:',
    ...REPOS.map((repo) => `- ${repo.fullName} at ${repo.dir}`),
    'Use those relative paths in every tool call. A change that belongs in one repository',
    'must not be copied into another unless the task needs it in both.',
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'You are a careful senior engineer working in a checked-out repository.',
  'Inspect before editing. Make the smallest change that satisfies the request.',
  'Never ask a tool to print environment variables, credentials or tokens.',
  'In plan mode, do not call write_file, apply_patch or run_command: answer with a short plan',
  'and a proposed unified diff in a fenced ```diff block. Wait for the member to approve it.',
  'After approval, implement the plan, then run each repository typecheck, lint and tests.',
  'Finish with a concise summary of what changed and how it was verified.',
].join(' ');

const LOCAL_SYSTEM_PROMPT = [
  'You are a careful senior engineer working in a folder the member granted on their own device.',
  'The folder is a git working tree and it was clean when the task started.',
  'Inspect before editing. Make the smallest change that satisfies the request.',
  'Never ask a tool to print environment variables, credentials or tokens, and never create, read',
  'or modify anything outside the folder.',
  'In plan mode, do not call write_file, apply_patch or run_command: answer with a short plan',
  'and a proposed unified diff in a fenced ```diff block. Wait for the member to approve it.',
  'After approval, implement the plan, then run the repository typecheck, lint and tests.',
  'Do not run git commit, git push or any command that changes history; the member reviews the diff.',
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
// Repository set, checkpoints and verification
// ---------------------------------------------------------------------------

const ASKPASS_SCRIPT = [
  '#!/bin/sh',
  'case "$1" in',
  "  *Username*) printf '%s\\n' 'x-access-token' ;;",
  '  *) printf \'%s\\n\' "$NOOR_GIT_TOKEN" ;;',
  'esac',
  '',
].join('\n');

/** Clone every repository into one workspace when the task has more than one. */
async function prepareWorkspace() {
  if (!MULTI) return;
  if (!HANDOFF_TOKEN) {
    throw new RunnerError('runner_failed', 'a multi-repository task needs an installation token');
  }
  for (const repo of REPOS) {
    if (
      !/^[A-Za-z0-9_.-]+$/.test(repo.owner) ||
      !/^[A-Za-z0-9_.-]+$/.test(repo.name) ||
      !repo.dir.startsWith('repos/')
    ) {
      throw new RunnerError('runner_failed', `invalid repository checkout: ${repo.fullName}`);
    }
  }
  const root = join(process.cwd(), '.noor-work');
  mkdirSync(root, { recursive: true });
  ASKPASS_PATH = join(root, '.noor-askpass.sh');
  writeFileSync(ASKPASS_PATH, ASKPASS_SCRIPT, { encoding: 'utf8', mode: 0o700 });

  for (const repo of REPOS) {
    const target = join(root, ...repo.dir.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    const clone = await spawnCommand(
      'git',
      [
        'clone',
        '--branch',
        repo.baseBranch,
        '--single-branch',
        '--depth',
        '50',
        `https://github.com/${repo.owner}/${repo.name}.git`,
        target,
      ],
      { cwd: root, env: gitEnv(), timeoutMs: 180_000 }
    );
    if (clone.exitCode !== 0) {
      throw new RunnerError(
        'runner_failed',
        `clone of ${repo.fullName} failed: ${clone.stderr.slice(0, 300)}`
      );
    }
  }
  process.chdir(root);
}

/** Local tasks have one root; a GitHub task has one per repository. */
function workTargets() {
  if (LOCAL) return [{ repo: null, cwd: process.cwd() }];
  if (!MULTI) return REPOS.map((repo) => ({ repo, cwd: process.cwd() }));
  return REPOS.map((repo) => ({ repo, cwd: safePath(repo.dir) }));
}

function git(args, cwd = process.cwd(), env = process.env) {
  return spawnCommand('git', args, { env, cwd, timeoutMs: 120_000 });
}

async function checkpoint(target) {
  await git(['add', '-A'], target.cwd);
  const status = (await git(['status', '--porcelain'], target.cwd)).stdout.trim();
  if (!status) return false;
  // The ephemeral runner has no git identity; commits fail without one.
  await git(['config', 'user.name', 'noor-coding-agent'], target.cwd);
  await git(['config', 'user.email', 'noor@royaraqamia.com'], target.cwd);
  const summary = `noor: ${target.repo ? target.repo.fullName : 'local'} checkpoint`;
  const result = await git(['commit', '-m', summary], target.cwd);
  if (result.exitCode !== 0) {
    throw new RunnerError('runner_failed', `checkpoint commit failed: ${result.stderr.slice(0, 200)}`);
  }
  return true;
}

function scriptsIn(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return pkg.scripts ?? {};
  } catch {
    // No package manifest: there is no repository-defined gate to run.
    return {};
  }
}

async function verify() {
  let ranAny = false;
  for (const target of workTargets()) {
    const scripts = scriptsIn(target.cwd);
    const names = ['typecheck', 'lint', 'test'].filter((name) => typeof scripts[name] === 'string');
    if (names.length === 0) continue;
    ranAny = true;
    const evidence = [];
    for (const name of names) {
      budgetCheck();
      const result = await spawnCommand('npm', ['run', name], {
        env: restrictedEnv(),
        cwd: target.cwd,
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      evidence.push(`$ npm run ${name}\nexit=${result.exitCode}\n${result.stdout}${result.stderr}`);
      if (result.exitCode !== 0) {
        await postUpdate(
          'test',
          'failed',
          cap(evidence.join('\n\n'), 20_000),
          null,
          'checks_failed',
          { repo: target.repo?.fullName ?? null }
        );
        throw new RunnerError('checks_failed', `npm run ${name} failed`);
      }
    }
    await postUpdate('test', 'applied', cap(evidence.join('\n\n'), 20_000), null, null, {
      repo: target.repo?.fullName ?? null,
    });
  }
  if (!ranAny) {
    await postUpdate(
      'test',
      'applied',
      'No typecheck, lint or test scripts in this workspace; nothing to run.',
      null,
      null
    );
  } else {
    console.log('[noor] verification passed');
  }
}

/**
 * A local task edits the member's own working tree, so the tree has to be clean
 * first: the diff the member reviews is then exactly the agent's work, and
 * `git checkout .` is a complete rollback. Runs before the first model call.
 */
async function preflightLocal() {
  const inside = await git(['rev-parse', '--is-inside-work-tree']);
  if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
    throw new RunnerError('runner_failed', 'the granted folder is not a git repository');
  }
  const dirty = (await git(['status', '--porcelain'])).stdout.trim();
  if (dirty) {
    throw new RunnerError(
      'runner_failed',
      'the granted folder has uncommitted changes; commit or stash them first'
    );
  }
}

// ---------------------------------------------------------------------------
// Reviewer (ADR-0223)
// ---------------------------------------------------------------------------

const REVIEWER_SYSTEM_PROMPT = [
  'You review a change another engineer just made. You do not edit files.',
  'Return JSON only, with this shape:',
  '{"verdict":"pass"|"block","blocking":[{"file":"...","line":0,"issue":"..."}],"advisory":[...]}',
  'A blocking finding is a correctness, security or data-loss defect that must be fixed',
  'before a human reviews the diff. Style, naming and preferences are advisory at most.',
  'Report only defects you can point at in the diff. An empty blocking list is normal.',
].join(' ');

/** The diff the reviewer reads: tracked changes plus untracked file names. */
async function collectDiff() {
  const parts = [];
  const seenFiles = new Set();
  let changedLines = 0;
  for (const target of workTargets()) {
    const label = target.repo?.fullName ?? '.';
    const diff = await git(['diff', '--no-color', '--unified=3'], target.cwd);
    const status = await git(['status', '--porcelain'], target.cwd);
    const untracked = status.stdout
      .split(/\r?\n/)
      .filter((line) => line.startsWith('?? '))
      .map((line) => line.slice(3));
    for (const line of status.stdout.split(/\r?\n/)) {
      const path = line.slice(3).trim();
      if (path) seenFiles.add(`${label}:${path}`);
    }
    for (const line of diff.stdout.split(/\r?\n/)) {
      if (/^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line)) changedLines++;
      if (line.startsWith('diff --git ')) parts.push(`# ${label}`);
    }
    if (diff.stdout.trim()) parts.push(diff.stdout.trim());
    if (untracked.length > 0) {
      parts.push(`${label} untracked files:\n${untracked.map((path) => `- ${path}`).join('\n')}`);
    }
  }
  return {
    text: cap(parts.join('\n\n'), MAX_REVIEW_DIFF),
    files: seenFiles.size,
    changedLines,
  };
}

function normalizeFindings(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (typeof item === 'string') return [{ file: null, line: null, issue: item.slice(0, 2000) }];
    if (!item || typeof item !== 'object') return [];
    const issue = typeof item.issue === 'string' ? item.issue : typeof item.message === 'string' ? item.message : '';
    if (!issue) return [];
    return [
      {
        file: typeof item.file === 'string' ? item.file : null,
        line: Number.isInteger(item.line) ? item.line : null,
        issue: issue.slice(0, 2000),
      },
    ];
  });
}

function parseFindings(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return {
        verdict: parsed.verdict === 'block' ? 'block' : 'pass',
        blocking: normalizeFindings(parsed.blocking),
        advisory: normalizeFindings(parsed.advisory),
      };
    } catch {
      // Fall through: an answer that is not JSON becomes one advisory note.
    }
  }
  return {
    verdict: 'pass',
    blocking: [],
    advisory: raw ? [{ file: null, line: null, issue: raw.slice(0, 4000) }] : [],
  };
}

function findingsSummary(findings) {
  const blocking = findings.blocking.length;
  const advisory = findings.advisory.length;
  if (blocking === 0 && advisory === 0) return 'No findings.';
  return `${blocking} blocking, ${advisory} advisory finding(s).`;
}

/**
 * Ask the second model about a non-trivial diff. It can never fail the task:
 * an unreachable reviewer is recorded as a step and the run continues.
 */
async function reviewDiff(summaryText) {
  const limits = spec.reviewer;
  if (!limits) return null;
  const diff = await collectDiff();
  if (diff.files === 0) return null;
  if (diff.files < Number(limits.minFiles) && diff.changedLines < Number(limits.minChangedLines)) {
    return null;
  }

  budgetCheck();
  const started = Date.now();
  let answer;
  try {
    answer = await api('/api/coding/runner/llm', {
      method: 'POST',
      body: {
        purpose: 'reviewer',
        messages: [
          { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `Task: ${spec.instruction}`,
              `Engineer's summary: ${summaryText || '(none)'}`,
              repoMap(),
              `Diff (${diff.files} files, ${diff.changedLines} changed lines):`,
              diff.text,
            ].join('\n\n'),
          },
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await postUpdate(
      'reviewer',
      'applied',
      cap(`Review unavailable: ${message}`, 20_000),
      null,
      null,
      { model: limits.model, latencyMs: Date.now() - started }
    );
    return null;
  }

  usage.inputTokens += Number(answer.usage?.inputTokens ?? 0);
  usage.outputTokens += Number(answer.usage?.outputTokens ?? 0);
  const findings = parseFindings(answer.message?.content);
  await postUpdate(
    'reviewer',
    'applied',
    cap(findingsSummary(findings), 20_000),
    JSON.stringify(findings, null, 2),
    null,
    { model: answer.model ?? limits.model, latencyMs: Date.now() - started }
  );
  console.log(`[noor] reviewer: ${findingsSummary(findings)}`);
  return findings;
}

function findingsForBody(findings) {
  if (!findings) return '';
  const lines = [];
  if (findings.blocking.length > 0) {
    lines.push('## Reviewer — blocking', '');
    for (const item of findings.blocking) {
      lines.push(`- ${item.file ? `\`${item.file}\`${item.line ? `:${item.line}` : ''}: ` : ''}${item.issue}`);
    }
    lines.push('');
  }
  if (findings.advisory.length > 0) {
    lines.push('## Reviewer — advisory', '');
    for (const item of findings.advisory) {
      lines.push(`- ${item.file ? `\`${item.file}\`${item.line ? `:${item.line}` : ''}: ` : ''}${item.issue}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------

/** Local work leaves an uncommitted diff in the folder; nothing is pushed. */
async function handoffLocal(summaryText) {
  const diff = (await git(['diff'])).stdout.trim();
  const untracked = (await git(['status', '--porcelain'])).stdout.trim();
  const body = diff || (untracked ? `Untracked files:\n${untracked}` : 'No file changes.');
  await postUpdate(
    'review',
    'applied',
    cap(summaryText || 'The changes are in your folder.', 20_000),
    cap(body, 200_000),
    null
  );
  console.log('[noor] local diff ready for review');
}

function prBody(summaryText, findings) {
  return cap(
    [
      summaryText || 'Automated coding task.',
      '',
      findingsForBody(findings),
      `Task: ${spec.taskId}`,
    ].join('\n'),
    20_000
  );
}

async function createPullRequest(repo, summaryText, findings) {
  const base = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
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
      title: (spec.title || `Noor coding task ${spec.taskId}`).slice(0, 200),
      head: repo.branch,
      base: repo.baseBranch,
      body: prBody(summaryText, findings),
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
    `${base}/pulls?head=${encodeURIComponent(`${repo.owner}:${repo.branch}`)}&state=open`,
    { cache: 'no-store', headers, signal: AbortSignal.timeout(20_000) }
  );
  if (existing.ok) {
    const rows = await existing.json();
    if (Array.isArray(rows) && rows[0]?.html_url) return rows[0].html_url;
  }
  throw new RunnerError('runner_failed', `pull request creation answered ${created.status}`);
}

async function handoff(summaryText, findings) {
  for (const target of workTargets()) {
    const repo = target.repo;
    if (!repo) continue;
    const committed = await checkpoint(target);
    await postUpdate(
      'commit',
      'applied',
      committed ? 'Checkpoint commit created.' : 'No file changes to commit.',
      null,
      null,
      { repo: repo.fullName }
    );

    const push = await git(
      ['push', 'origin', `HEAD:${repo.branch}`],
      target.cwd,
      MULTI ? gitEnv() : process.env
    );
    if (push.exitCode !== 0) {
      throw new RunnerError(
        'runner_failed',
        `git push to ${repo.fullName} failed: ${push.stderr.slice(0, 500)}`
      );
    }
    await postUpdate('push', 'applied', `Pushed ${repo.branch} to ${repo.fullName}.`, null, null, {
      repo: repo.fullName,
    });

    const url = await createPullRequest(repo, summaryText, findings);
    await postUpdate('pull_request', 'applied', `Pull request: ${url}`, url, null, {
      repo: repo.fullName,
    });
    console.log(`[noor] pull request ${repo.fullName} ${url}`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  // Refuse a dirty folder before spending a model call or touching a file.
  if (LOCAL) await preflightLocal();
  await prepareWorkspace();

  const firstState = await taskState();
  if (!isActive(firstState.status)) {
    console.log(`[noor] task already ${firstState.status}; nothing to do`);
    return;
  }
  if (firstState.decision === 'reject') {
    throw new RunnerError('plan_rejected', 'The member rejected the task.');
  }

  const messages = [
    { role: 'system', content: LOCAL ? LOCAL_SYSTEM_PROMPT : SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Task ${spec.taskId}: ${spec.instruction}`,
        repoMap(),
        `Mode: ${spec.mode}`,
      ].join('\n'),
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
    cap(edit.finalText || 'Changes are ready.', 20_000),
    null,
    null
  );

  await verify();

  // The second model sees the diff before the member does. Its blocking
  // findings earn one repair pass, exactly as a judge earns one rewrite
  // (ADR-0213); anything unresolved is attached to the diff for the human.
  const findings = await reviewDiff(edit.finalText);
  if (findings && findings.blocking.length > 0) {
    messages.push({
      role: 'user',
      content: [
        'An independent reviewer found these blocking issues in your change:',
        JSON.stringify(findings.blocking),
        'Fix only these issues, keep the rest of the change intact, then verify again.',
      ].join('\n'),
    });
    const repair = await agentLoop(messages, TOOL_DEFINITIONS, 'repair');
    if (!repair.stopped) {
      await postUpdate('edit', 'applied', 'Reviewer findings addressed.', null, null);
      await verify();
    }
  }

  // Local edit mode stops at the external-effect boundary. Full mode has that
  // escalation granted by its mode; plan mode has already been approved once.
  if (!LOCAL && spec.mode === 'edit') {
    const blocking = findings?.blocking.length ?? 0;
    const hint =
      blocking > 0
        ? ` The reviewer still reports ${blocking} blocking issue(s); they are attached to the diff.`
        : '';
    await postUpdate(
      'push',
      'running',
      `Requesting approval to push and open a pull request per repository.${hint}`,
      null,
      null
    );
    const verdict = await waitForDecision();
    if (verdict !== 'approve') {
      const code = verdict === 'reject' ? 'push_rejected' : 'budget_exhausted';
      await postUpdate('push', 'failed', `Push not approved (${verdict}).`, null, code);
      throw new RunnerError(code, `Push not approved (${verdict}).`);
    }
  }

  if (LOCAL) {
    await handoffLocal(edit.finalText);
    console.log('[noor] task complete');
    return;
  }

  await handoff(edit.finalText, findings);
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
