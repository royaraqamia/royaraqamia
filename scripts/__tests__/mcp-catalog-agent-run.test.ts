import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The runner's own behaviour, without the network (#1302).
 *
 * `plan` reads the endpoint's candidate page and measures each row through the
 * probe; `apply` sends the acts the plan and the decisions allow. Both are
 * stubbed here — the remote client because the probe is not what this file is
 * about, and `fetch` because the endpoint is not either.
 */

const probe = vi.hoisted(() => ({
  result: {
    connectable: true,
    reason: null as string | null,
    authMode: 'oauth' as 'oauth' | 'none' | 'api_key' | null,
    logoUrl: null as string | null,
    logoMime: null as string | null,
  },
}));

vi.mock('@/backend/clients/mcp-remote', () => ({
  createMcpRemoteClient: () => ({
    probeConnectable: async () => probe.result,
  }),
}));

import { main } from '../mcp-catalog-agent/run';

interface PlanFile {
  generatedAt: string;
  baseUrl: string;
  cap: number;
  publishCap: number;
  stoppedAt: string | null;
  entries: Record<string, unknown>[];
  coverage: { eligible: number; published: number; waiting: number };
  counts: { measured: number; publishable: number; onPagePublished: number };
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    registryName: 'com.example/mcp',
    title: 'Example MCP Server',
    description: 'An example.',
    titleOverride: null,
    nameAr: null,
    descriptionAr: null,
    iconUrl: null,
    measuredMark: null,
    probeAuthMode: null,
    class: 'dcr',
    checks: [{ name: 'probe', ok: true, detail: null }],
    published: false,
    publishable: false,
    withdraw: false,
    skip: null,
    detail: null,
    needsMark: false,
    needsCopy: false,
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    registryName: 'com.example/mcp',
    title: 'Example MCP Server',
    description: 'An example.',
    titleOverride: 'Example',
    nameAr: null,
    descriptionAr: 'مثال.',
    remoteUrl: 'https://mcp.example.com/mcp',
    redirectUri: 'https://royaraqamia.com/mcp/callback',
    iconUrl: 'https://cdn.example.com/logo.svg',
    verified: true,
    authMode: 'oauth',
    connectable: true,
    connectableReason: null,
    probedAt: '2026-11-10T00:00:00.000Z',
    staticClient: null,
    ...overrides,
  };
}

describe('the catalogue agent runner', () => {
  let dir: string;
  let calls: Record<string, unknown>[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-catalog-agent-'));
    calls = [];
    probe.result = {
      connectable: true,
      reason: null,
      authMode: 'oauth',
      logoUrl: null,
      logoMime: null,
    };

    process.env.MCP_CATALOG_AGENT_TOKEN = 'test-token';
    process.env.MCP_CATALOG_AGENT_URL = 'https://catalogue.test';
    process.env.MCP_CATALOG_AGENT_PLAN_PATH = join(dir, 'plan.json');
    process.env.MCP_CATALOG_AGENT_DECISIONS_PATH = join(dir, 'decisions.json');
    process.env.MCP_CATALOG_AGENT_RESULT_PATH = join(dir, 'result.json');
    process.env.MCP_CATALOG_AGENT_MARKS_PATH = join(dir, 'marks.json');
    process.env.MCP_CATALOG_AGENT_MARKS_BODY_PATH = join(dir, 'marks.md');
    process.env.MCP_CATALOG_AGENT_ENABLED = 'true';
    process.env.MCP_CATALOG_AGENT_DRY_RUN = 'false';
    delete process.env.GITHUB_STEP_SUMMARY;

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('MCP_CATALOG_AGENT_')) delete process.env[name];
    }
  });

  function answer(data: unknown) {
    return vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return { ok: true, status: 200, json: async () => ({ success: true, data }) };
    });
  }

  function writePlan(entries: Record<string, unknown>[]): void {
    const plan: PlanFile = {
      generatedAt: '2026-11-11T00:00:00.000Z',
      baseUrl: 'https://catalogue.test',
      cap: 20,
      publishCap: 20,
      stoppedAt: null,
      entries,
      coverage: { eligible: 0, published: 0, waiting: 0 },
      counts: { measured: entries.length, publishable: 0, onPagePublished: 0 },
    };
    writeFileSync(process.env.MCP_CATALOG_AGENT_PLAN_PATH as string, JSON.stringify(plan));
  }

  function writeDecisions(decisions: unknown): void {
    writeFileSync(
      process.env.MCP_CATALOG_AGENT_DECISIONS_PATH as string,
      JSON.stringify(decisions)
    );
  }

  describe('plan', () => {
    async function planFor(rows: Record<string, unknown>[]) {
      vi.stubGlobal(
        'fetch',
        answer({ candidates: rows, coverage: { eligible: 0, published: 0, waiting: 0 } })
      );
      await main(['plan']);
      const written = JSON.parse(
        // The runner writes the plan it just measured to this exact path.
        readFileSync(process.env.MCP_CATALOG_AGENT_PLAN_PATH as string, 'utf8')
      ) as PlanFile;
      return written.entries;
    }

    it('asks a published row for the mark it never had', async () => {
      const [measured] = await planFor([candidate({ iconUrl: null, descriptionAr: null })]);

      expect(measured).toMatchObject({
        published: true,
        withdraw: false,
        needsMark: true,
        needsCopy: true,
      });
    });

    it('takes the published row’s mark from the logo_uri the probe measured', async () => {
      probe.result = {
        connectable: true,
        reason: null,
        authMode: 'oauth',
        logoUrl: 'https://cdn.example.com/measured.svg',
        logoMime: 'image/svg+xml',
      };
      const [measured] = await planFor([candidate({ iconUrl: null })]);

      expect(measured).toMatchObject({
        needsMark: false,
        measuredMark: 'https://cdn.example.com/measured.svg',
      });
    });

    it('leaves a published row with a mark and copy alone', async () => {
      const [measured] = await planFor([candidate()]);

      expect(measured).toMatchObject({ published: true, needsMark: false, needsCopy: false });
    });

    it('still records a withdrawal for a published row the probe cannot reach', async () => {
      probe.result = {
        connectable: false,
        reason: 'unreachable',
        authMode: null,
        logoUrl: null,
        logoMime: null,
      };
      const [measured] = await planFor([candidate()]);

      expect(measured).toMatchObject({ withdraw: true, published: true });
    });

    it('does not ask an unverified row for anything it cannot be published without', async () => {
      probe.result = {
        connectable: false,
        reason: 'no_registration',
        authMode: 'oauth',
        logoUrl: null,
        logoMime: null,
      };
      const [measured] = await planFor([candidate({ verified: false, iconUrl: null })]);

      expect(measured).toMatchObject({
        published: false,
        skip: 'no_registration',
        needsMark: false,
      });
    });
  });

  describe('apply', () => {
    it('writes the mark a published row was sourced, and does not verify it again', async () => {
      vi.stubGlobal('fetch', answer({}));
      writePlan([entry({ published: true, iconUrl: null, needsMark: true })]);
      writeDecisions({
        marks: [
          {
            registryName: 'com.example/mcp',
            mark: 'https://cdn.simpleicons.org/canva',
            source: 'simple_icons',
          },
        ],
      });

      await main(['apply']);

      expect(calls).toEqual([
        {
          action: 'mark',
          registryName: 'com.example/mcp',
          mark: 'https://cdn.simpleicons.org/canva',
          source: 'simple_icons',
        },
      ]);
    });

    it('writes the logo_uri the probe measured for a published row', async () => {
      vi.stubGlobal('fetch', answer({}));
      writePlan([
        entry({
          published: true,
          iconUrl: null,
          measuredMark: 'https://cdn.example.com/measured.svg',
          needsMark: false,
        }),
      ]);

      await main(['apply']);

      expect(calls).toEqual([
        {
          action: 'mark',
          registryName: 'com.example/mcp',
          mark: 'https://cdn.example.com/measured.svg',
          source: 'logo_uri',
        },
      ]);
    });

    it('sends nothing for a published row that has its mark and copy', async () => {
      vi.stubGlobal('fetch', answer({}));
      writePlan([
        entry({
          published: true,
          iconUrl: 'https://cdn.example.com/logo.svg',
          titleOverride: 'Example',
          descriptionAr: 'مثال.',
        }),
      ]);

      await main(['apply']);

      expect(calls).toEqual([]);
    });

    it('writes a published row’s copy without touching its vouch', async () => {
      vi.stubGlobal('fetch', answer({}));
      writePlan([
        entry({
          published: true,
          iconUrl: 'https://cdn.example.com/logo.svg',
          needsCopy: true,
        }),
      ]);
      writeDecisions({
        copies: [
          {
            registryName: 'com.example/mcp',
            titleOverride: 'Example',
            nameAr: 'إكزامبل',
            descriptionAr: 'مثال.',
          },
        ],
      });

      await main(['apply']);

      expect(calls).toEqual([
        {
          action: 'copy',
          registryName: 'com.example/mcp',
          titleOverride: 'Example',
          nameAr: 'إكزامبل',
          descriptionAr: 'مثال.',
          source: { title: 'Example MCP Server', description: 'An example.' },
        },
      ]);
    });

    it('still withdraws a published row the probe could not reach', async () => {
      vi.stubGlobal('fetch', answer({}));
      writePlan([entry({ published: true, withdraw: true, detail: 'unreachable' })]);

      await main(['apply']);

      expect(calls).toEqual([
        {
          action: 'withdraw',
          registryName: 'com.example/mcp',
          failedCheck: 'probe',
          detail: 'unreachable',
        },
      ]);
    });

    it('keeps the unverified publish path unchanged', async () => {
      vi.stubGlobal('fetch', answer({}));
      writePlan([
        entry({
          publishable: true,
          iconUrl: 'https://cdn.example.com/logo.svg',
          checks: [
            { name: 'probe', ok: true, detail: null },
            { name: 'registration', ok: true, detail: null },
            { name: 'admission', ok: true, detail: null },
          ],
        }),
      ]);

      await main(['apply']);

      expect(calls).toEqual([
        {
          action: 'verify',
          registryName: 'com.example/mcp',
          class: 'dcr',
          probeAuthMode: null,
          checks: [
            { name: 'probe', ok: true, detail: null },
            { name: 'registration', ok: true, detail: null },
            { name: 'admission', ok: true, detail: null },
          ],
        },
      ]);
    });

    it('writes nothing on a dry run', async () => {
      vi.stubGlobal('fetch', answer({}));
      process.env.MCP_CATALOG_AGENT_DRY_RUN = 'true';
      writePlan([entry({ published: true, iconUrl: null, needsMark: true })]);
      writeDecisions({
        marks: [
          {
            registryName: 'com.example/mcp',
            mark: 'https://cdn.simpleicons.org/canva',
            source: 'simple_icons',
          },
        ],
      });

      await main(['apply']);

      expect(calls).toEqual([]);
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('would mark `com.example/mcp`')
      );
    });
  });
});
