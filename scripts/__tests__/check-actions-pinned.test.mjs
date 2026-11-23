import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { main, unpinnedUses } from '../check-actions-pinned.mjs';

/** The script must gate a real process, not just return a number in a test. */
const SCRIPT = resolve(process.cwd(), 'scripts/check-actions-pinned.mjs');

function check(source) {
  return unpinnedUses(source, 'fixture.yml');
}

function fixture(source) {
  const dir = mkdtempSync(join(tmpdir(), 'actions-pinned-'));
  const file = join(dir, 'fixture.yml');
  writeFileSync(file, source, 'utf8');
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function run(source) {
  const { file, cleanup } = fixture(source);
  try {
    return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  } finally {
    cleanup();
  }
}

describe('action pin audit', () => {
  it('accepts a 40-hex commit SHA with its Dependabot version comment', () => {
    expect(
      check('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7')
    ).toEqual([]);
  });

  it('accepts local actions and job-level reusable-workflow calls', () => {
    const source = [
      '        uses: ./.github/actions/setup-environment',
      '  call:',
      '    uses: owner/repo/.github/workflows/build.yml@3d3c42e5aac5ba805825da76410c181273ba90b1',
    ].join('\n');
    expect(check(source)).toEqual([]);
  });

  it('fails a tag or branch by name and line', () => {
    const source = 'jobs:\n  build:\n    steps:\n      - uses: actions/checkout@v7\n';
    expect(check(source)).toEqual([
      {
        file: 'fixture.yml',
        line: 4,
        ref: 'actions/checkout@v7',
        reason: 'an action must be pinned to a 40-hex commit SHA, not a tag or branch',
      },
    ]);
  });

  it('accepts a Docker digest but fails the mutable :latest tag', () => {
    const digest =
      'docker://rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667';
    expect(check(`        uses: ${digest} # v1.7.12`)).toEqual([]);

    const result = check('        uses: docker://rhysd/actionlint:latest');
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain('sha256 digest');
  });

  it('fails a reference with no pin or more than one @', () => {
    expect(check('        uses: actions/checkout')).toHaveLength(1);
    expect(check('        uses: actions/checkout@abc@def')).toHaveLength(1);
  });

  it('ignores comment lines and lines that merely mention uses:', () => {
    const source = [
      '      # uses: actions/checkout@v7',
      '        run: echo "uses: actions/checkout@v7"',
    ].join('\n');
    expect(check(source)).toEqual([]);
  });
});

describe('the check as a process', () => {
  it('exits 0 on a fixture whose references are all pinned', () => {
    const result = run(
      '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n'
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('every external uses');
  });

  it('exits 1 on a fixture containing uses: actions/checkout@v7', () => {
    const result = run('      - uses: actions/checkout@v7\n');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('actions/checkout@v7');
    expect(result.stdout).toContain('40-hex commit SHA');
  });

  it('exits 0 on the checked-in workflows', () => {
    expect(main([], () => {})).toBe(0);
  });
});

describe('the gate wiring', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/repo-checks.yml'),
    'utf8'
  );
  const lines = workflow.split('\n');
  const start = lines.indexOf('  actionlint:');
  const next = lines.findIndex((line, i) => i > start && /^  [a-z][a-z0-9-]*:$/.test(line));
  const actionlintJob = lines.slice(start, next === -1 ? undefined : next).join('\n');

  it('runs in the actionlint job, which has no condition that skips pull requests', () => {
    expect(actionlintJob).toContain('run: node scripts/check-actions-pinned.mjs');
    expect(actionlintJob).not.toMatch(/^\s+if:/m);
    expect(workflow).toContain('  pull_request:');
  });

  it('exposes an npm alias for the check', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.scripts['check:actions-pinned']).toBe('node scripts/check-actions-pinned.mjs');
  });
});
