import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const helpers = require('../audit/github-helpers.cjs');
const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const STALE_MS = 26 * 60 * 60 * 1000;
const product = { name: 'Product Audit', scheduleHourUtc: 15, scheduleMinuteUtc: 10 };

describe('the audit publisher protects identifiers while redacting contact details', () => {
  it('keeps the date in a title, which is how a report is dated', () => {
    expect(helpers.redact('audit(product): a finding (2026-11-20)')).toBe(
      'audit(product): a finding (2026-11-20)'
    );
  });

  it('keeps an ISO timestamp, where a trailing word boundary would fail', () => {
    expect(helpers.redact('captured 2026-11-20T14:30:00Z from production')).toBe(
      'captured 2026-11-20T14:30:00Z from production'
    );
  });

  it('rewrites a runner-local capture path to the artifact root', () => {
    expect(helpers.redact('capture `/tmp/audit-evidence/door.json`')).toBe(
      'capture `audit-evidence/door.json`'
    );
  });

  it('keeps a dated evidence line and an openable migration filename', () => {
    const body = [
      'baseline recorded 2026-11-19 in `docs/mobile/visual-gate.json`',
      '`supabase/migrations/20261119143000_habit_reminders_use_damascus_clock.sql:40`',
    ].join('\n');
    expect(helpers.redact(body)).toBe(body);
  });

  it('still redacts email, phone, tokens and credentials', () => {
    // Assembled at runtime: a token-shaped literal in test source is itself a
    // finding for gitleaks, which scans every added line of this branch.
    const credential = 'g' + 'hp_abcdefghijklmnopqrstuvwxyz123456';
    const jwt = [
      'ey' + 'JhbGciOiJIUzI1NiJ9',
      'ey' + 'JzdWIiOiIxMjM0NTY3ODkwIn0',
      'abcdefghij',
    ].join('.');
    const redacted = helpers.redact(
      ['member@example.com', '+963968478904', credential, jwt].join(' ')
    );
    expect(redacted).toContain('[email redacted]');
    expect(redacted).toContain('[number redacted]');
    expect(redacted).toContain('[secret redacted]');
    expect(redacted).toContain('[token redacted]');
    expect(redacted).not.toContain('member@example.com');
    expect(redacted).not.toContain('+963968478904');
  });

  it('gives reports one stable issue and a distinct marker per report', () => {
    expect(helpers.reportTitle('ui-ux')).toBe('audit(ui-ux): daily report log (rolling)');
    const first = helpers.reportMarker(
      'ui-ux',
      '2026-11-20',
      'audit(ui-ux): daily report — reading'
    );
    const second = helpers.reportMarker('ui-ux', '2026-11-20', 'audit(ui-ux): report — pricing');
    expect(first).toBe('<!-- audit:report:ui-ux:2026-11-20:audit-ui-ux-daily-report-reading -->');
    expect(second).not.toBe(first);
    expect(helpers.reportDatePrefix('ui-ux', '2026-11-20')).toBe(
      '<!-- audit:report:ui-ux:2026-11-20:'
    );
    expect(helpers.utcDate(Date.parse('2026-11-20T23:59:00Z'))).toBe('2026-11-20');
  });
});

describe('the heartbeat clock starts when a workflow was introduced, not at now', () => {
  const introduced = Date.parse('2026-11-19T08:32:56Z');

  it('expects the first scheduled tick after introduction', () => {
    expect(helpers.firstExpectedAt(product, introduced).toISOString()).toBe(
      '2026-11-19T15:10:00.000Z'
    );
  });

  it('does not call a workflow lapsed before its first slot was due (#1654)', () => {
    const now = Date.parse('2026-11-19T14:06:12Z');
    expect(helpers.isLapsed(null, product, now, STALE_MS, introduced)).toBe(false);
  });

  it('does call a workflow that never ran lapsed 26 hours after its first slot', () => {
    const now = Date.parse('2026-11-20T17:11:00Z');
    expect(helpers.isLapsed(null, product, now, STALE_MS, introduced)).toBe(true);
  });

  it('waits when the introduction commit cannot be read', () => {
    const now = Date.parse('2030-01-01T00:00:00Z');
    expect(helpers.isLapsed(null, product, now, STALE_MS, null)).toBe(false);
  });

  it('still judges a workflow with a heartbeat by the heartbeat age', () => {
    const now = Date.parse('2026-11-20T15:00:00Z');
    expect(helpers.isLapsed('2026-11-20T14:00:00Z', product, now, STALE_MS, introduced)).toBe(
      false
    );
    expect(helpers.isLapsed('2026-11-19T12:00:00Z', product, now, STALE_MS, introduced)).toBe(true);
  });
});

describe('the workflows keep the guard and the dead-man switch connected', () => {
  const runner = read('.github/actions/audit-runner/action.yml');
  const health = read('.github/workflows/issue-automation-health.yml');

  it('checks out the repository before loading the shared helper', () => {
    expect(health).toContain('uses: actions/checkout@');
    expect(health).toContain(
      "require(process.env.GITHUB_WORKSPACE + '/scripts/audit/github-helpers.cjs')"
    );
  });

  it('counts report comments as well as finding issues toward the daily three', () => {
    expect(runner).toContain('const total = todayFindings.length + todayReports;');
    expect(runner).toContain('if (total >= 3 && !force)');
    expect(runner).toContain("candidate.kind === 'report'");
    expect(runner).toContain('body: marker +');
  });

  it('prefeeds recent report comments so rotation still works after the move', () => {
    expect(runner).toContain('payload.recentReports');
    expect(runner).toContain('fromLog.length < 3');
    expect(runner).toContain("state: 'all',");
    expect(read('.github/opencode/audits/_base.md')).toContain('recentReports');
  });

  it('links every entry to the run and its retained evidence artifact', () => {
    expect(runner).toContain('description: body + provenance');
    expect(runner).toContain('helpers.listComments(');
    expect(runner).toContain("audit-evidence-' + domain + '-' + context.runId");
    expect(runner).toContain('retention-days: 90');
    expect(read('.github/opencode/audits/_base.md')).toContain('audit-evidence/<file>');
  });

  it('uses the schedule-aware lapsed predicate and knows each audit tick', () => {
    expect(health).toContain('helpers.isLapsed(');
    expect(health).toContain('helpers.firstExpectedAt(');
    expect(health).not.toContain('lapsed: !beat');
    for (const minute of ['10', '11', '12', '13', '14', '15']) {
      expect(health, minute).toContain(`scheduleHourUtc: ${minute}, scheduleMinuteUtc: 10`);
    }
  });
});
