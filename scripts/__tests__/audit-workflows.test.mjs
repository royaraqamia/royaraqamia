import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Six unattended auditors publish to a public tracker every day. What a quiet edit
 * could break, and nothing else would notice:
 *
 * - all six exist, run in distinct off-peak hours and share one runner;
 * - the runner has the web + Android evidence toolchain and no Vercel access;
 * - the prompt demands reproduction, redaction and exactly three dated entries;
 * - the day guard counts issues actually filed, so a partial day is filled;
 * - publication is append-only on existing issues and never hands work to the
 *   implementer without a human;
 * - the health monitor and the pg_cron dispatcher know all six.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom.
 */
const DOMAINS = ['performance', 'security', 'ui-ux', 'scalability', 'maintainability', 'product'];

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('the specialised audits file only what they reproduced', () => {
  const runner = read('.github/actions/audit-runner/action.yml');
  const base = read('.github/opencode/audits/_base.md');
  const health = read('.github/workflows/issue-automation-health.yml');
  const migration = read('supabase/migrations/20261215000000_dispatch_audit_workflows.sql');

  it('has six workflows, each on its own off-peak hour', () => {
    const hours = [];
    for (const domain of DOMAINS) {
      const file = `.github/workflows/audit-${domain}.yml`;
      const workflow = read(file);
      expect(workflow).toContain('uses: ./.github/actions/audit-runner');
      expect(workflow).toContain(`domain: ${domain}`);
      expect(workflow).toContain(`label: audit:${domain}`);
      expect(workflow).toContain(`prompt-file: .github/opencode/audits/${domain}.md`);
      expect(workflow).toMatch(/^\s*- cron: '10 (\d+) \* \* \*'$/m);
      hours.push(Number(/cron: '10 (\d+)/.exec(workflow)[1]));
    }
    expect(new Set(hours).size).toBe(6);
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...hours)).toBeLessThan(16);
  });

  it('installs the full web + Android toolchain in the shared runner', () => {
    expect(runner).toContain('npx playwright install --with-deps chromium');
    expect(runner).toContain('platforms;android-36');
    expect(base).toContain('npm run check:visual');
    expect(runner).toContain("install-vercel: 'false'");
    expect(runner).toContain('--version 2.3.2');
    expect(runner).toContain('opencode run --model');
    for (const domain of DOMAINS) {
      expect(read(`.github/workflows/audit-${domain}.yml`)).not.toContain('VERCEL_TOKEN');
      expect(read(`.github/workflows/audit-${domain}.yml`)).not.toContain('VERCEL_ORG_ID');
      expect(read(`.github/workflows/audit-${domain}.yml`)).not.toContain('VERCEL_PROJECT_ID');
    }
  });

  it('gives the agent Render, Supabase and E2E access', () => {
    for (const domain of DOMAINS) {
      const workflow = read(`.github/workflows/audit-${domain}.yml`);
      expect(workflow, domain).toContain('RENDER_API_KEY');
      expect(workflow, domain).toContain('SUPABASE_ACCESS_TOKEN');
      expect(workflow, domain).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(workflow, domain).toContain('E2E_TEST_EMAIL');
      expect(workflow, domain).toContain('E2E_VISUAL_EMAIL');
      expect(workflow, domain).toContain('issues: write');
    }
    expect(base).toContain('https://api.render.com/v1');
    expect(base).toContain('read-only');
  });

  it('never assumes: evidence, redaction and senior-level fixes are in the contract', () => {
    expect(base).toContain('Never assume');
    expect(base).toContain('## Evidence');
    expect(base).toContain('## Long-term fix');
    expect(base).toContain('## Why not a quick fix');
    expect(base).toContain('repository is public');
    expect(base).toContain('393 x 852');
    expect(base).toContain('npm run check:visual');
    expect(base).toContain('graphify query');
  });

  it('demands depth, rotation and real gates instead of shallow checklist theatre', () => {
    expect(base).toContain('Coverage and rotation');
    expect(base).toContain('deferred');
    expect(base).toContain('confidence: "high"');
    expect(base).toContain('at least two independent pieces of evidence');
    expect(base).toContain('bypasses RLS');
    expect(base).toContain('median and p95');
    expect(read('.github/opencode/audits/performance.md')).toContain('perf:check');
    expect(read('.github/opencode/audits/security.md')).toContain(
      'audit:deps -- --scope=production'
    );
    expect(read('.github/opencode/audits/security.md')).toContain('code-scanning/alerts');
    expect(read('.github/opencode/audits/maintainability.md')).toContain(
      'check:runner-permissions'
    );
    expect(read('.github/opencode/audits/ui-ux.md')).toContain('npx playwright test <spec>');
    expect(read('.github/opencode/audits/product.md')).toContain('make you reverse the decision');
  });

  it('publishes exactly three dated entries and never labels them ready-for-agent', () => {
    expect(base).toContain('exactly 3');
    expect(base).toContain('kind": "report | finding"');
    expect(base).toContain('ready-for-agent');
    expect(base).toContain('Never add');
    expect(runner).toContain('candidates.slice(0, 3)');
  });

  it('counts the entries actually published, so a partial day is filled', () => {
    expect(runner).toContain('if (total >= 3 && !force)');
    expect(runner).toContain('Date.parse(issue.created_at) >= startOfDayUtc.getTime()');
    expect(runner).toContain('created += 1');
    expect(runner).toContain('if (total < 3)');
    expect(runner).toContain('core.setFailed');
    expect(runner).toContain("if: always() && steps.guard.outputs.run == 'true'");
  });

  it('edits existing issues append-only and de-duplicates before filing', () => {
    expect(runner).toContain('existingTitles.has(key)');
    expect(runner).toContain('github.rest.issues.createComment');
    expect(runner).toContain('audit:update:');
    expect(read('scripts/audit/github-helpers.cjs')).toContain('[email redacted]');
    expect(base).toContain('Do not re-file it');
  });

  it('opens private advisories only in the security audit', () => {
    const security = read('.github/workflows/audit-security.yml');
    expect(security).toContain('security-events: write');
    expect(security).toContain("security-advisories: 'true'");
    expect(runner).toContain('POST /repos/{owner}/{repo}/security-advisories');
    for (const domain of DOMAINS.filter((d) => d !== 'security')) {
      expect(read(`.github/workflows/audit-${domain}.yml`)).not.toContain('security-events: write');
    }
  });

  it('is watched by the health monitor and dispatched by pg_cron', () => {
    for (const domain of DOMAINS) {
      expect(health, domain).toContain(`audit-${domain}.yml`);
      expect(migration, domain).toContain(`audit-${domain}.yml`);
    }
    expect(health).not.toContain('issue-planner.yml');
    expect(migration).toContain("cron.unschedule('dispatch-issue-planner')");
  });
});
