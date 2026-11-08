#!/usr/bin/env node
/**
 * No permission prompt is reachable in a headless run (ADR-0142).
 *
 * On 2026-11-08 the Issue Implementer's round 3 spent 72 minutes waiting for a
 * human to answer a permission request, then died on the step's 90-minute cap.
 * The request was for `external_directory` on `/home/runner/work/royaraqamia/*`
 * - the parent of the checkout - because the agent resolved a path with `..`.
 * Nothing failed: `ask` is what OpenCode does when no rule matches, and a
 * runner has nobody to ask.
 *
 * So the question this check answers is not "does the config mention paths".
 * It is: **for every surface a run can reach, does the rule set resolve to
 * `allow` or `deny`, never `ask`?** The answer is computed, not reviewed, with
 * the same last-match-wins evaluation OpenCode 1.x uses
 * (`packages/opencode/src/permission/index.ts`, `findLast`), against the agent
 * defaults the CLI ships.
 *
 * The defaults below mirror `packages/opencode/src/agent/agent.ts` at the
 * version the runner installs (`releases/latest`, v1.19.5 when this was
 * written). They are here to be able to tell "our config decides this" from
 * "the CLI's default decides this": a probe that resolves to `ask` through a
 * default is exactly the bug, so the defaults must be in the model.
 *
 * Usage:
 *   npm run check:runner-permissions
 *
 * It needs no server, no build and no network.
 */

import { readConfig, readTemplate, PLACEHOLDER } from './runner-config.mjs';

/**
 * OpenCode's wildcard, copied from `packages/core/src/util/wildcard.ts`: `*`
 * spans `/`, `?` is one character, the whole value is anchored, and `\\` reads
 * as `/` so a Windows path cannot dodge a rule.
 */
export function matches(value, pattern) {
  const input = String(value).replaceAll('\\', '/');
  let escaped = String(pattern)
    .replaceAll('\\', '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  if (escaped.endsWith(' .*')) escaped = escaped.slice(0, -3) + '( .*)?';
  return new RegExp('^' + escaped + '$', 's').test(input);
}

/** `~` and `$HOME` expand when the config loads (`fromConfig` in `permission/index.ts`). */
export function expand(pattern, home = '/home/runner') {
  if (pattern === '~') return home;
  if (pattern.startsWith('~/')) return home + pattern.slice(1);
  if (pattern === '$HOME') return home;
  if (pattern.startsWith('$HOME/')) return home + pattern.slice(5);
  return pattern;
}

/** The last rule that matches wins; nothing matches means `ask`. */
export function evaluate(permission, pattern, rules, home) {
  const found = rules.findLast(
    (rule) => matches(permission, rule.permission) && matches(pattern, expand(rule.pattern, home))
  );
  return found?.action ?? 'ask';
}

/**
 * The agent defaults a headless `build` run starts from, in order.
 *
 * `agent.ts` merges `defaults`, the agent's own additions and then the user's
 * config, and `session/tools.ts` merges the agent's rule set with the
 * session's. The GitHub handler's session adds `question: deny`, which is why
 * the question tool cannot block a run either.
 */
export function defaultRules(home = '/home/runner') {
  const data = `${home}/.local/share/opencode`;
  return [
    { permission: '*', pattern: '*', action: 'allow' },
    { permission: 'doom_loop', pattern: '*', action: 'ask' },
    { permission: 'external_directory', pattern: '*', action: 'ask' },
    { permission: 'external_directory', pattern: `${data}/tool-output/*`, action: 'allow' },
    { permission: 'external_directory', pattern: '/tmp/opencode/*', action: 'allow' },
    { permission: 'question', pattern: '*', action: 'deny' },
    { permission: 'plan_enter', pattern: '*', action: 'deny' },
    { permission: 'plan_exit', pattern: '*', action: 'deny' },
    { permission: 'read', pattern: '*', action: 'allow' },
    { permission: 'read', pattern: '*.env', action: 'ask' },
    { permission: 'read', pattern: '*.env.*', action: 'ask' },
    { permission: 'read', pattern: '*.env.example', action: 'allow' },
    // the build agent's own additions
    { permission: 'question', pattern: '*', action: 'allow' },
    { permission: 'plan_enter', pattern: '*', action: 'allow' },
  ];
}

/**
 * What the GitHub handler puts on the session itself, merged after the agent's
 * rule set (`session/tools.ts`). It is the reason a question cannot block a run.
 */
export const SESSION_RULES = [{ permission: 'question', pattern: '*', action: 'deny' }];

/** A config object (`permission` in `opencode.json`) as the rule list OpenCode builds. */
export function rulesFromConfig(permission = {}) {
  const rules = [];
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === 'string') {
      rules.push({ permission: key, pattern: '*', action: value });
      continue;
    }
    for (const [pattern, action] of Object.entries(value))
      rules.push({ permission: key, pattern, action });
  }
  return rules;
}

/**
 * Every surface a run reaches, with the pattern the tool passes.
 *
 * `external_directory` is asked with the *directory boundary* the file sits in
 * (`external-directory.ts`), and `read` with the path relative to the worktree
 * (`tool/read.ts`), so both are written here the way they arrive.
 */
export const PROBES = [
  {
    permission: 'external_directory',
    pattern: '/home/runner/work/royaraqamia/*',
    expect: 'deny',
    why: 'the parent of the checkout, the ask that cost the round',
  },
  {
    permission: 'external_directory',
    pattern: '/tmp/*',
    expect: 'allow',
    why: 'the result-file handoff',
  },
  {
    permission: 'external_directory',
    pattern: '/tmp/opencode/*',
    expect: 'allow',
    why: 'the CLI scratch directory',
  },
  {
    permission: 'external_directory',
    pattern: '/home/runner/.local/share/opencode/tool-output/*',
    expect: 'allow',
    why: 'reading a truncated tool result',
  },
  {
    permission: 'external_directory',
    pattern: '/home/runner/work/_temp/*',
    expect: 'allow',
    why: 'the runner temp directory',
  },
  {
    permission: 'read',
    pattern: '.env',
    expect: 'deny',
    why: 'the default asks, so it must be decided',
  },
  { permission: 'read', pattern: 'backend/.env', expect: 'deny', why: 'the same, nested' },
  { permission: 'read', pattern: '.env.local', expect: 'deny', why: 'the same, with a suffix' },
  {
    permission: 'read',
    pattern: '.env.example',
    expect: 'allow',
    why: 'the one env file the defaults allow',
  },
  {
    permission: 'read',
    pattern: 'app/page.tsx',
    expect: 'allow',
    why: 'the ordinary read a run depends on',
  },
  { permission: 'read', pattern: 'mcp:supabase:*', expect: 'allow', why: 'an MCP resource read' },
  {
    permission: 'doom_loop',
    pattern: '*',
    expect: 'deny',
    why: 'a repeated identical call must end the loop, not wait',
  },
  {
    permission: 'bash',
    pattern: 'npm run lint',
    expect: 'allow',
    why: 'the ordinary command a run depends on',
  },
  {
    permission: 'edit',
    pattern: 'app/page.tsx',
    expect: 'allow',
    why: 'the ordinary edit a run depends on',
  },
  {
    permission: 'webfetch',
    pattern: 'https://example.com',
    expect: 'allow',
    why: 'the docs a run reads',
  },
  {
    permission: 'question',
    pattern: '*',
    expect: 'deny',
    why: 'nobody is there to answer a question',
  },
];

/**
 * The failure list: a probe that resolved differently than intended, a probe
 * that resolved to `ask`, and any rule in the config that is itself an `ask`.
 */
export function check(config, { home = '/home/runner' } = {}) {
  const failures = [];
  const permission = config?.permission ?? {};
  const rules = [...defaultRules(home), ...rulesFromConfig(permission), ...SESSION_RULES];

  for (const [key, value] of Object.entries(permission)) {
    if (value === 'ask')
      failures.push(`permission.${key} is "ask": a runner has nobody to answer it`);
    if (value && typeof value === 'object') {
      for (const [pattern, action] of Object.entries(value)) {
        if (action === 'ask')
          failures.push(
            `permission.${key}["${pattern}"] is "ask": a runner has nobody to answer it`
          );
      }
    }
  }

  for (const probe of PROBES) {
    const resolved = evaluate(probe.permission, probe.pattern, rules, home);
    if (resolved === 'ask') {
      failures.push(
        `${probe.permission} "${probe.pattern}" resolves to ask (${probe.why}); ` +
          'the run would wait for a human until its step timeout'
      );
      continue;
    }
    if (resolved !== probe.expect) {
      failures.push(
        `${probe.permission} "${probe.pattern}" resolves to ${resolved}, expected ${probe.expect} (${probe.why})`
      );
    }
  }

  // The catch-all is what keeps a permission this file has never heard of -
  // a new tool, or a new default in a later CLI - from becoming a prompt.
  const catchAll = rulesFromConfig(permission).find(
    (rule) => rule.permission === '*' && rule.pattern === '*'
  );
  if (catchAll?.action !== 'allow') {
    failures.push(
      'permission["*"] must be "allow": it is what decides any surface the explicit rules do not name'
    );
  }

  const template = readTemplate();
  if (!template.includes(PLACEHOLDER)) {
    failures.push(
      `the runner config no longer carries ${PLACEHOLDER}, so the MCP URL cannot be rendered`
    );
  }

  return failures;
}

function main() {
  const failures = check(readConfig());
  if (failures.length) {
    console.error('The headless runner can still reach a permission prompt:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nDecide the surface in .github/opencode/runner.json; do not leave it to the default (ADR-0142).'
    );
    process.exit(1);
  }
  console.log(
    `Runner permissions: ${PROBES.length} surfaces resolve to allow or deny, none to ask.`
  );
}

if (process.argv[1] && /runner-permissions\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
