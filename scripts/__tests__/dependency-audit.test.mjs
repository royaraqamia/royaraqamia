import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advisoryIdsFromVia,
  classifyFindings,
  validateExceptions,
} from '../check-dependency-audit.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const committed = () => JSON.parse(read('security/audit-exceptions.json'));

const entry = (overrides = {}) => ({
  id: 'GHSA-fc5q-39xc-vjpf',
  scope: 'all',
  reason: 'Build-time only, no patched version upstream.',
  owner: 'royaraqamia',
  upstream: 'https://github.com/micromatch/picomatch/pull/194',
  expires: '2026-12-17',
  ...overrides,
});

const finding = (via, severity = 'high') => ({ severity, via });

describe('advisoryIdsFromVia', () => {
  it('reads the GHSA id from an npm advisory URL', () => {
    expect(
      advisoryIdsFromVia([
        {
          source: 1247710,
          url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
          severity: 'high',
        },
      ])
    ).toEqual(['GHSA-FC5Q-39XC-VJPF']);
  });

  it('ignores dependency names and numeric sources, and deduplicates', () => {
    expect(
      advisoryIdsFromVia([
        'picomatch',
        { source: 123, severity: 'high' },
        { source: 'GHSA-fc5q-39xc-vjpf', severity: 'high' },
        { url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf', severity: 'high' },
      ])
    ).toEqual(['GHSA-FC5Q-39XC-VJPF']);
  });
});

describe('classifyFindings', () => {
  const report = {
    vulnerabilities: {
      picomatch: finding([
        {
          source: 1247710,
          url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
          severity: 'high',
        },
      ]),
      another: finding([{ source: 'GHSA-aaaa-bbbb-cccc', severity: 'critical' }], 'critical'),
      moderate: finding([{ source: 'GHSA-dddd-eeee-ffff' }], 'moderate'),
    },
  };

  it('suppresses only the excepted advisory, at the severity npm reported it', () => {
    const result = classifyFindings(
      report,
      validateExceptions({ version: 1, exceptions: [entry()] }, '2026-11-17').exceptions,
      'all'
    );
    expect(result.suppressed.map((item) => item.id)).toEqual(['GHSA-FC5Q-39XC-VJPF']);
    expect(result.blocking.map((item) => item.id)).toEqual(['GHSA-AAAA-BBBB-CCCC']);
    expect(result.blocking[0].packages).toEqual(['another']);
  });

  it('does not let a production-only exception weaken the full audit', () => {
    const exceptions = validateExceptions(
      { version: 1, exceptions: [entry({ scope: 'production' })] },
      '2026-11-17'
    ).exceptions;
    expect(classifyFindings(report, exceptions, 'production').suppressed).toHaveLength(1);
    expect(classifyFindings(report, exceptions, 'all').blocking.map((item) => item.id)).toContain(
      'GHSA-FC5Q-39XC-VJPF'
    );
  });

  it('treats a missing report as an empty tree', () => {
    expect(classifyFindings(null, [], 'production')).toEqual({ blocking: [], suppressed: [] });
  });
});

describe('validateExceptions', () => {
  const valid = (exceptions, today = '2026-11-17') =>
    validateExceptions({ version: 1, exceptions }, today);

  it('accepts the committed entry', () => {
    const result = validateExceptions(committed(), '2026-11-17');
    expect(result.errors).toEqual([]);
    expect(result.exceptions.map((item) => item.id)).toEqual(['GHSA-FC5Q-39XC-VJPF']);
  });

  it('fails an expired entry, so an accepted risk is re-checkable', () => {
    const result = validateExceptions(committed(), '2026-12-18');
    expect(result.errors[0]).toContain('expired');
  });

  it('refuses an expiry more than a year out', () => {
    expect(valid([entry({ expires: '2029-01-01' })], '2026-11-17').errors[0]).toContain('at most');
  });

  it('requires an advisory id, a reason, an owner, an https link and a scope', () => {
    const result = valid([
      entry({
        id: 'CVE-2026-112366',
        reason: '  ',
        owner: '',
        upstream: 'http://example.com',
        scope: 'dev',
      }),
    ]);
    expect(result.errors).toHaveLength(5);
  });

  it('refuses two entries for the same advisory', () => {
    expect(valid([entry(), entry({ scope: 'production' })], '2026-11-17').errors[0]).toContain(
      'duplicates'
    );
  });
});

describe('the workflow', () => {
  it('gates both lanes on the policy script, not raw npm audit severity', () => {
    const workflow = read('.github/workflows/security-scan.yml');
    expect(workflow).toContain('npm run audit:deps -- --scope=production');
    expect(workflow).toContain('npm run audit:deps -- --scope=all');
    expect(workflow).not.toContain('npm audit --audit-level');
  });
});
