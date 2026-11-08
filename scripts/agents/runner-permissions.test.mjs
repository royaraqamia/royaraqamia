import { describe, expect, it } from 'vitest';

import { render, readConfig, readTemplate } from './runner-config.mjs';
import { check, evaluate, matches, rulesFromConfig } from './runner-permissions.mjs';
import { unansweredAsk } from './permission-ask.mjs';

const HOME = '/home/runner';

/** The config as it was before ADR-0142: one allow, everything else default. */
const before = {
  permission: {
    external_directory: { '/tmp/*': 'allow' },
    doom_loop: 'deny',
  },
};

const rules = (permission) => [...rulesFromConfig(permission)];

describe('the wildcard OpenCode matches paths with', () => {
  it('lets * cross a slash, which is how a nested .env is caught', () => {
    expect(matches('backend/.env', '*.env')).toBe(true);
    expect(matches('.env', '*.env')).toBe(true);
    expect(matches('app/page.tsx', '*.env')).toBe(false);
  });

  it('reads a backslash as a slash', () => {
    expect(matches('C:\\repo\\.env', '*.env')).toBe(true);
  });

  it('anchors the whole value, so a rule cannot match a prefix', () => {
    expect(matches('/tmp/opencode/x', '/tmp/*')).toBe(true);
    expect(matches('/tmp', '/tmp/*')).toBe(false);
  });
});

describe('the last matching rule wins', () => {
  it('prefers a later deny over an earlier allow', () => {
    const rules = [
      { permission: '*', pattern: '*', action: 'allow' },
      { permission: 'external_directory', pattern: '*', action: 'deny' },
    ];
    expect(evaluate('external_directory', '/tmp/*', rules, HOME)).toBe('deny');
  });

  it('answers ask when nothing matches, which is the hang', () => {
    expect(evaluate('external_directory', '/home/runner/work/royaraqamia/*', [], HOME)).toBe('ask');
  });
});

describe('the committed runner config', () => {
  it('resolves every surface to allow or deny, never to ask', () => {
    expect(check(readConfig(), { home: HOME })).toEqual([]);
  });

  it('denies the parent of the checkout that cost round 3', () => {
    const config = readConfig();
    const all = [...rules(config.permission)];
    expect(evaluate('external_directory', '/home/runner/work/royaraqamia/*', all, HOME)).toBe(
      'deny'
    );
  });

  it('still allows the result-file handoff and a truncated tool result', () => {
    const all = rules(readConfig().permission);
    expect(evaluate('external_directory', '/tmp/*', all, HOME)).toBe('allow');
    expect(
      evaluate('external_directory', '/home/runner/.local/share/opencode/tool-output/*', all, HOME)
    ).toBe('allow');
  });

  it('decides the .env reads the CLI defaults to asking about', () => {
    const all = rules(readConfig().permission);
    expect(evaluate('read', '.env', all, HOME)).toBe('deny');
    expect(evaluate('read', '.env.local', all, HOME)).toBe('deny');
    expect(evaluate('read', '.env.example', all, HOME)).toBe('allow');
  });

  it('fails the check the old config would have failed', () => {
    const failures = check(before, { home: HOME });
    expect(failures.join('\n')).toMatch(
      /external_directory "\/home\/runner\/work\/royaraqamia\/\*" resolves to ask/
    );
  });

  it('refuses an "ask" written into the config itself', () => {
    const failures = check({ permission: { bash: 'ask' } }, { home: HOME });
    expect(failures.join('\n')).toMatch(/permission\.bash is "ask"/);
  });
});

describe('rendering the config for a runner', () => {
  it('injects the project reference and leaves the env placeholder alone', () => {
    const text = render('abc123');
    expect(text).not.toContain('__SUPABASE_PROJECT_REF__');
    expect(text).toContain('project_ref=abc123');
    expect(text).toContain('{env:SUPABASE_ACCESS_TOKEN}');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('refuses to render without a project reference', () => {
    expect(() => render('')).toThrow(/SUPABASE_PROJECT_REF/);
  });

  it('keeps the compaction and MCP settings the runner needs', () => {
    const config = JSON.parse(readTemplate().replaceAll('__SUPABASE_PROJECT_REF__', 'abc123'));
    expect(config.compaction).toEqual({ prune: true });
    expect(config.mcp.supabase.enabled).toBe(true);
  });
});

describe('the unanswered permission request in a log', () => {
  it('reads the request round 3 died on', () => {
    const text = [
      '[12:03:28.919] INFO (#21115): resolved path {',
      '  arg: "..",',
      '}',
      '[12:03:28.927] INFO (#21115): asking {',
      '  id: "per_1bb0aca1f001b1zckn5tCdzKqb",',
      '  permission: "external_directory",',
      '  patterns: [ "/home/runner/work/royaraqamia/*" ],',
      '}',
    ].join('\n');
    expect(unansweredAsk(text)).toEqual({
      permission: 'external_directory',
      pattern: '/home/runner/work/royaraqamia/*',
    });
  });

  it('says nothing when the request was answered', () => {
    const text = [
      'asking {',
      '  permission: "external_directory",',
      '  patterns: [ "/tmp/*" ],',
      '}',
      '[12:04:00.000] INFO (#21115): replied {',
      '  reply: "once",',
      '}',
    ].join('\n');
    expect(unansweredAsk(text)).toBeNull();
  });

  it('says nothing when the run never asked', () => {
    expect(unansweredAsk('[12:03:25.702] INFO (#7842): loop { step: 141 }')).toBeNull();
  });
});
