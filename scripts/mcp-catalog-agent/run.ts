import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import { createMcpRemoteClient } from '@/backend/clients/mcp-remote';
import {
  assertEgressUrl,
  createGuardedFetch,
  EgressBlockedError,
  readCappedText,
} from '@/backend/shared/egress';
import {
  McpCatalogAgentPageSchema,
  type McpCatalogAgentCandidate,
  type McpCatalogAgentCheck,
  type McpCatalogAgentSkipReason,
} from '@/shared/contracts/mcp-catalog-agent';

/**
 * The deterministic half of the catalogue agent (#1293).
 *
 * Two commands, so a model step can sit between them:
 *
 * - `plan` measures a capped page of candidate rows through the existing probe
 *   and egress code and writes what it measured to a plan file. It writes
 *   nothing to the store.
 * - `apply` reads the plan and the sourcing decisions a model step wrote, checks
 *   them against what was measured, and applies them through the scoped endpoint.
 *   A dry run or a closed kill switch writes nothing and says so.
 *
 * The checks decide; the model only sources a mark and translates the
 * publisher's own text. Nothing here publishes a row whose check failed, and a
 * model decision that names a source it cannot have is refused.
 */

const ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * The files the two commands hand each other — the plan, the model's decisions,
 * the result and the mark request — live in one directory made for this run,
 * never at a fixed name in a shared `/tmp` (`js/insecure-temporary-file`:
 * a predictable path lets another local process plant a symlink first).
 *
 * `plan` and `apply` are separate processes with a model step between them, so
 * the directory has to be agreed rather than rediscovered: `plan` publishes it
 * on `$GITHUB_OUTPUT` (`dir=…`), and the job passes it back as
 * `MCP_CATALOG_AGENT_RUNTIME_DIR`. A hand run sets that variable itself.
 */
const RUNTIME_DIR_ENV = 'MCP_CATALOG_AGENT_RUNTIME_DIR';

const FILE_NAMES = {
  plan: 'plan.json',
  decisions: 'decisions.json',
  result: 'result.json',
  marks: 'marks.json',
  marksBody: 'marks.md',
} as const;

type RuntimeFile = keyof typeof FILE_NAMES;

let runtimeDirCache: string | null = null;

function runtimeDir(): string {
  if (runtimeDirCache) return runtimeDirCache;
  const configured = process.env[RUNTIME_DIR_ENV]?.trim();
  if (configured) {
    mkdirSync(configured, { recursive: true, mode: 0o700 });
    runtimeDirCache = configured;
    return configured;
  }
  // `mkdtemp` makes the name unpredictable and the directory private (0700),
  // which is what closes the symlink race a fixed name leaves open.
  const base = process.env.RUNNER_TEMP?.trim() || tmpdir();
  runtimeDirCache = mkdtempSync(join(base, 'mcp-catalog-agent-'));
  return runtimeDirCache;
}

/** A per-file `MCP_CATALOG_AGENT_*_PATH` still wins, so one file can be pinned. */
function runtimeFile(file: RuntimeFile, overrideName: string): string {
  const configured = process.env[overrideName]?.trim();
  return configured || join(runtimeDir(), FILE_NAMES[file]);
}

function planPath(): string {
  return runtimeFile('plan', 'MCP_CATALOG_AGENT_PLAN_PATH');
}

function decisionsPath(): string {
  return runtimeFile('decisions', 'MCP_CATALOG_AGENT_DECISIONS_PATH');
}

/** Later steps of the job read the directory from here; a hand run has no output file. */
function announceRuntimeDir(): void {
  const output = process.env.GITHUB_OUTPUT?.trim();
  if (!output) return;
  appendFileSync(output, `dir=${runtimeDir()}\n`);
}

type PublishClass = 'dcr' | 'pre_registered' | 'none';

interface PlanEntry {
  registryName: string;
  title: string | null;
  description: string | null;
  titleOverride: string | null;
  nameAr: string | null;
  descriptionAr: string | null;
  iconUrl: string | null;
  /** The `logo_uri` the probe measured, written automatically when there is no mark. */
  measuredMark: string | null;
  class: PublishClass;
  checks: McpCatalogAgentCheck[];
  /** The row already passes and is in the store. */
  published: boolean;
  /** The row passes and may be published this run. */
  publishable: boolean;
  withdraw: boolean;
  skip: McpCatalogAgentSkipReason | null;
  detail: string | null;
  needsMark: boolean;
  needsCopy: boolean;
}

interface Plan {
  generatedAt: string;
  baseUrl: string;
  cap: number;
  publishCap: number;
  /** Where measurement stopped when the egress budget ran out. */
  stoppedAt: string | null;
  entries: PlanEntry[];
  /** Store-wide counts, the same numbers the console header draws. */
  coverage: { eligible: number; published: number; waiting: number };
  counts: { measured: number; publishable: number; onPagePublished: number };
}

const MarkDecisionSchema = z.object({
  registryName: z.string().min(1),
  mark: z.string().min(1),
  source: z.enum(['logo_uri', 'brand', 'simple_icons', 'repo']),
  /** Ship a Simple Icons mark under public/brand/mcp in the run's batched PR. */
  vendor: z.boolean().optional(),
});

const CopyDecisionSchema = z.object({
  registryName: z.string().min(1),
  titleOverride: z.string().max(120).nullable().optional(),
  nameAr: z.string().max(120).nullable().optional(),
  descriptionAr: z.string().max(1000).nullable().optional(),
});

const DecisionsSchema = z.object({
  marks: z.array(MarkDecisionSchema).max(40).default([]),
  copies: z.array(CopyDecisionSchema).max(40).default([]),
});

type Decisions = z.infer<typeof DecisionsSchema>;

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function baseUrl(): string {
  return (process.env.MCP_CATALOG_AGENT_URL?.trim() || 'https://royaraqamia.com').replace(
    /\/+$/,
    ''
  );
}

function token(): string {
  const value = process.env.MCP_CATALOG_AGENT_TOKEN?.trim();
  // A missing credential is a failed job, not a quiet zero-work success.
  if (!value) throw new Error('MCP_CATALOG_AGENT_TOKEN is not set');
  return value;
}

async function callAgent(body: unknown): Promise<unknown> {
  const response = await fetch(`${baseUrl()}/api/internal/mcp/catalog-agent`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    message?: string;
    data?: unknown;
  } | null;

  if (!response.ok || payload?.success !== true) {
    throw new Error(
      `the catalogue agent answered ${response.status}: ${payload?.error ?? 'unknown'}${
        payload?.message ? ` (${payload.message})` : ''
      }`
    );
  }
  return payload.data;
}

/** The authorize endpoint accepts our client id and registered redirect URI. */
async function authorizeAccepts(
  client: {
    authorizationEndpoint: string;
    clientId: string;
  },
  redirectUri: string
): Promise<boolean> {
  assertEgressUrl(client.authorizationEndpoint);
  const url = new URL(client.authorizationEndpoint);
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', 'catalogue-probe');

  const response = await fetch(url, {
    redirect: 'manual',
    headers: { accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  });

  // A login or consent page is the pass: a 3xx is the provider's own redirect
  // to it, and a 2xx is the page itself.
  if (response.status < 300) {
    const body = await response.text().catch(() => '');
    return !/invalid_client|invalid_redirect_uri|application not found/i.test(body);
  }
  if (response.status < 400) return true;

  // A refusal is a refusal: `invalid_client` and `invalid_redirect_uri` are the
  // two answers this check exists for, and a 4xx is neither a login page nor a
  // consent screen.
  return false;
}

function skipEntry(
  candidate: McpCatalogAgentCandidate,
  reason: McpCatalogAgentSkipReason,
  detail: string
): PlanEntry {
  return {
    registryName: candidate.registryName,
    title: candidate.title,
    description: candidate.description,
    titleOverride: candidate.titleOverride,
    nameAr: candidate.nameAr,
    descriptionAr: candidate.descriptionAr,
    iconUrl: candidate.iconUrl,
    measuredMark: null,
    class: 'none',
    checks: [],
    published: candidate.verified,
    publishable: false,
    withdraw: false,
    skip: reason,
    detail,
    needsMark: false,
    needsCopy: false,
  };
}

/**
 * One row, measured. Everything a publish needs is decided here and recorded in
 * the plan, so `apply` never has to trust a model about whether a check passed.
 */
async function measure(candidate: McpCatalogAgentCandidate): Promise<PlanEntry> {
  const remote = createMcpRemoteClient();
  const preRegistered = candidate.staticClient !== null;

  let verdict;
  try {
    verdict = await remote.probeConnectable(candidate.remoteUrl, { preRegistered });
  } catch (error) {
    if (error instanceof EgressBlockedError)
      return skipEntry(candidate, 'check_failed', error.message);
    throw error;
  }

  const probeCheck: McpCatalogAgentCheck = {
    name: 'probe',
    ok: verdict.connectable,
    detail: verdict.connectable ? null : (verdict.reason ?? 'unreachable'),
  };

  const base: PlanEntry = {
    registryName: candidate.registryName,
    title: candidate.title,
    description: candidate.description,
    titleOverride: candidate.titleOverride,
    nameAr: candidate.nameAr,
    descriptionAr: candidate.descriptionAr,
    iconUrl: candidate.iconUrl,
    measuredMark: verdict.logoUrl,
    class: 'none',
    checks: [probeCheck],
    published: candidate.verified,
    publishable: false,
    withdraw: false,
    skip: null,
    detail: null,
    needsMark: false,
    needsCopy: false,
  };

  if (candidate.verified) {
    // Already in the store: the measurement is a re-check, and a failure is the
    // withdraw the issue promises a member will never be surprised by.
    if (!verdict.connectable) {
      return { ...base, withdraw: true, detail: verdict.reason ?? 'unreachable' };
    }
    /*
      A published row is measured for the same two gaps a publish would have
      asked about. Publishing vouched for a row, not for its mark: the seeded
      rows shipped with a letter tile because the registry published nothing and
      Canva has no Simple Icons mark, and no run could ever fix one (#1302). The
      answer is written as an edit, never as a second vouch.
    */
    return {
      ...base,
      class: preRegistered ? 'pre_registered' : 'dcr',
      needsMark: !candidate.iconUrl && !verdict.logoUrl,
      needsCopy: !candidate.titleOverride || !candidate.descriptionAr,
    };
  }

  if (!verdict.connectable) {
    // No way to become a client is one category: no registration document at
    // all, or metadata that publishes everything except `registration_endpoint`.
    // Anything else (unreachable, blocked) may clear on its own next run.
    const noRegistration =
      candidate.staticClient === null &&
      (verdict.reason === 'no_metadata' || verdict.reason === 'no_registration');
    return {
      ...base,
      skip: noRegistration ? 'no_registration' : 'check_failed',
      detail: verdict.reason ?? 'unreachable',
    };
  }

  const checks: McpCatalogAgentCheck[] = [
    probeCheck,
    { name: 'admission', ok: true, detail: null },
  ];

  if (candidate.staticClient) {
    const accepted = await authorizeAccepts(
      {
        authorizationEndpoint: candidate.staticClient.authorizationEndpoint,
        clientId: candidate.staticClient.clientId,
      },
      candidate.redirectUri
    );
    if (!accepted) {
      return {
        ...base,
        checks: [...checks, { name: 'authorize', ok: false, detail: 'the provider refused' }],
        skip: 'check_failed',
        detail: 'the authorize endpoint refused our client',
      };
    }
    return {
      ...base,
      class: 'pre_registered',
      checks: [...checks, { name: 'authorize', ok: true, detail: null }],
      publishable: true,
      needsMark: !candidate.iconUrl && !verdict.logoUrl,
      needsCopy: !candidate.titleOverride || !candidate.descriptionAr,
    };
  }

  let discovery;
  try {
    discovery = await remote.discover(candidate.remoteUrl);
  } catch {
    return { ...base, skip: 'check_failed', detail: 'the metadata document could not be read' };
  }

  if (!discovery.registrationEndpoint) {
    return { ...base, skip: 'no_registration', detail: 'no dynamic registration' };
  }

  try {
    await remote.register({
      discovery,
      redirectUri: candidate.redirectUri,
      clientName: 'royaraqamia-catalogue',
    });
  } catch {
    return {
      ...base,
      checks: [...checks, { name: 'registration', ok: false, detail: 'registration refused' }],
      skip: 'check_failed',
      detail: 'dynamic registration was refused',
    };
  }

  return {
    ...base,
    class: 'dcr',
    checks: [...checks, { name: 'registration', ok: true, detail: null }],
    publishable: true,
    needsMark: !candidate.iconUrl && !verdict.logoUrl,
    needsCopy: !candidate.titleOverride || !candidate.descriptionAr,
  };
}

async function plan(): Promise<Plan> {
  token();
  const cap = integer('MCP_CATALOG_AGENT_CAP', 20, 1, 20);
  const publishCap = integer('MCP_CATALOG_AGENT_PUBLISH_CAP', 3, 1, 20);
  const egressBudget = integer('MCP_CATALOG_AGENT_EGRESS_BUDGET', cap, 1, 20);

  const page = McpCatalogAgentPageSchema.parse(await callAgent({ action: 'list', limit: cap }));

  const entries: PlanEntry[] = [];
  let stoppedAt: string | null = null;

  for (const [index, candidate] of page.candidates.entries()) {
    if (index >= egressBudget) {
      stoppedAt = candidate.registryName;
      break;
    }
    entries.push(await measure(candidate));
  }

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: baseUrl(),
    cap,
    publishCap,
    stoppedAt,
    entries,
    coverage: page.coverage,
    counts: {
      measured: entries.length,
      publishable: entries.filter((entry) => entry.publishable && !entry.published).length,
      onPagePublished: entries.filter((entry) => entry.published && !entry.withdraw).length,
    },
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** A decision is only usable when the plan asked for it and the source is provable. */
function markActionFor(
  entry: PlanEntry,
  decision: z.infer<typeof MarkDecisionSchema>
): { action: 'mark'; registryName: string; mark: string; source: string } | { skip: string } {
  if (decision.source === 'simple_icons') {
    let url: URL;
    try {
      url = new URL(decision.mark);
    } catch {
      return { skip: 'the simple-icons decision is not a URL' };
    }
    if (url.hostname !== 'cdn.simpleicons.org') {
      return { skip: 'simple-icons mark must be served by cdn.simpleicons.org' };
    }
  }

  if (decision.source === 'logo_uri' && decision.mark !== entry.measuredMark) {
    return { skip: 'the logo_uri decision is not the mark the probe measured' };
  }

  if (decision.source === 'repo' && !decision.mark.startsWith('/brand/')) {
    return { skip: 'a repo mark must be a /brand/ path we ship' };
  }

  if (decision.mark.startsWith('/')) {
    if (!decision.mark.startsWith('/brand/'))
      return { skip: 'a shipped mark must live under /brand/' };
    if (!existsSync(join(ROOT, 'public', decision.mark))) {
      return { skip: 'the shipped mark is not in the repository yet' };
    }
  } else {
    try {
      assertEgressUrl(decision.mark);
    } catch {
      return { skip: 'the mark URL is not one the egress policy accepts' };
    }
  }

  return {
    action: 'mark',
    registryName: entry.registryName,
    mark: decision.mark,
    source: decision.source,
  };
}

/**
 * Ship a Simple Icons mark in the run's batched pull request: fetch it through
 * the egress policy, refuse anything that is not an SVG, and return the path the
 * site will serve it from. The row waits as `repo_pr_pending` until that merges.
 */
async function vendorMark(url: string): Promise<string | null> {
  const parsed = new URL(url);
  const slug = parsed.pathname.replace(/^\/+/, '').replace(/\.svg$/i, '');
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null;

  const publicPath = `/brand/mcp/${slug}.svg`;
  const target = join(ROOT, 'public', publicPath);

  try {
    const response = await createGuardedFetch()(url);
    if (!response.ok) return null;
    const svg = await readCappedText(response);
    if (!svg.trimStart().startsWith('<svg')) return null;
    mkdirSync(dirname(target), { recursive: true });
    try {
      // `wx` creates the file or fails, so there is no check-then-write window
      // for a link planted in between (`js/file-system-race`).
      writeFileSync(target, svg, { flag: 'wx' });
    } catch (error) {
      // The mark is already shipped by an earlier run, which is the same
      // outcome for this row: the path is returned, and the pull request that
      // carries it is the one somebody merges.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return null;
    }
    return publicPath;
  } catch {
    return null;
  }
}

function summary(plan: Plan, lines: string[]): string {
  return [
    '## MCP catalogue agent',
    '',
    `- eligible: ${plan.coverage.eligible}`,
    `- published: ${plan.coverage.published}`,
    `- waiting on a human: ${plan.coverage.waiting}`,
    `- measured this run: ${plan.counts.measured}`,
    `- publishable this run: ${plan.counts.publishable}`,
    ...(plan.stoppedAt ? [`- stopped at the egress budget: \`${plan.stoppedAt}\``] : []),
    '',
    ...lines,
    '',
  ].join('\n');
}

async function apply(): Promise<void> {
  const planFile = planPath();
  const decisionsFile = decisionsPath();

  if (!existsSync(planFile)) throw new Error(`no plan at ${planFile}`);
  const plan = JSON.parse(readFileSync(planFile, 'utf8')) as Plan;
  const decisions: Decisions = existsSync(decisionsFile)
    ? DecisionsSchema.parse(readJson(decisionsFile))
    : { marks: [], copies: [] };

  const dryRun = flag('MCP_CATALOG_AGENT_DRY_RUN', true);
  const enabled = flag('MCP_CATALOG_AGENT_ENABLED', false);
  const lines: string[] = [];
  const writes = dryRun || !enabled ? 0 : 1;

  if (writes === 0) {
    lines.push(
      dryRun
        ? 'Dry run: nothing was written. Dispatch with `dry_run=false` to apply.'
        : 'The kill switch (`MCP_CATALOG_AGENT_ENABLED`) is off: nothing was written.'
    );
  }

  const marks = new Map(decisions.marks.map((mark) => [mark.registryName, mark] as const));
  const copies = new Map(decisions.copies.map((copy) => [copy.registryName, copy] as const));
  const withdrawals: Array<{ registryName: string; detail: string | null }> = [];
  const vendored: Array<{ registryName: string; path: string; source: string }> = [];
  let published = 0;

  for (const entry of plan.entries) {
    const actions: unknown[] = [];

    if (entry.withdraw) {
      actions.push({
        action: 'withdraw',
        registryName: entry.registryName,
        failedCheck: 'probe',
        detail: entry.detail,
      });
    }

    if (!entry.withdraw && entry.skip) {
      actions.push({
        action: 'skip',
        registryName: entry.registryName,
        reason: entry.skip,
        detail: entry.detail,
      });
    }

    /*
      A mark and a copy are edits, so a row already in the store is offered them
      too — that is the only way a published row's letter tile is ever replaced
      (#1302). Only a first publish re-verifies, and a published row is never
      withdrawn by this path: its `verified_at` does not move.
    */
    if ((entry.publishable || entry.published) && !entry.withdraw && !entry.skip) {
      let hasMark = entry.iconUrl !== null;

      if (!hasMark && entry.measuredMark) {
        actions.push({
          action: 'mark',
          registryName: entry.registryName,
          mark: entry.measuredMark,
          source: 'logo_uri',
        });
        hasMark = true;
      }

      const mark = marks.get(entry.registryName);
      let waitingForPr = false;
      if (!hasMark && mark && mark.vendor && mark.source === 'simple_icons') {
        if (writes === 0) {
          actions.push({
            action: 'skip',
            registryName: entry.registryName,
            reason: 'repo_pr_pending',
            detail: 'would vendor',
          });
          waitingForPr = true;
        } else {
          const path = await vendorMark(mark.mark).catch(() => null);
          if (path) {
            vendored.push({ registryName: entry.registryName, path, source: mark.mark });
            actions.push({
              action: 'skip',
              registryName: entry.registryName,
              reason: 'repo_pr_pending',
              detail: path,
            });
            waitingForPr = true;
          }
        }
      }

      if (!hasMark && !waitingForPr && mark) {
        const markAction = markActionFor(entry, mark);
        if ('skip' in markAction) {
          actions.push({
            action: 'skip',
            registryName: entry.registryName,
            reason: markAction.skip.includes('repository yet') ? 'repo_pr_pending' : 'no_mark',
            detail: markAction.skip,
          });
        } else {
          actions.push(markAction);
          hasMark = true;
        }
      }

      const copy = copies.get(entry.registryName);
      if (copy) {
        actions.push({
          action: 'copy',
          registryName: entry.registryName,
          ...(copy.titleOverride !== undefined ? { titleOverride: copy.titleOverride } : {}),
          ...(copy.nameAr !== undefined ? { nameAr: copy.nameAr } : {}),
          ...(copy.descriptionAr !== undefined ? { descriptionAr: copy.descriptionAr } : {}),
          // The source text comes from the plan, never from the model.
          source: { title: entry.title, description: entry.description },
        });
      }

      if (!hasMark && !mark) {
        actions.push({
          action: 'skip',
          registryName: entry.registryName,
          reason: 'no_mark',
          detail: 'no mark from any allowed source',
        });
      } else if (entry.published) {
        // Nothing left to send: the mark and the copy were the actions, and a
        // second vouch is the one thing a published row must not get.
      } else if (!waitingForPr && hasMark && published < plan.publishCap) {
        actions.push({
          action: 'verify',
          registryName: entry.registryName,
          class: entry.class,
          checks: entry.checks,
        });
        published += 1;
      } else if (hasMark) {
        actions.push({
          action: 'skip',
          registryName: entry.registryName,
          reason: 'check_failed',
          detail: `the publish cap of ${plan.publishCap} was reached`,
        });
      }
    }

    for (const action of actions) {
      const name = (action as { action: string }).action;
      const registryName = (action as { registryName: string }).registryName;
      if (writes === 0) {
        lines.push(`- would ${name} \`${registryName}\``);
        continue;
      }
      try {
        await callAgent(action);
        lines.push(`- ${name} \`${registryName}\``);
        if (name === 'withdraw') {
          withdrawals.push({
            registryName,
            detail: (action as { detail?: string | null }).detail ?? null,
          });
        }
      } catch (error) {
        // One refused row must not cost the run the rest of the page; the row
        // stays for the next run and the summary names it.
        lines.push(
          `- **failed** ${name} \`${registryName}\`: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  const report = summary(plan, lines);
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
  }

  /*
    The workflow reads this, not the summary text: a withdrawal a member can meet
    has to be traceable to the check that failed, and one tracking issue (opened
    or commented by the workflow) is where it lands.
  */
  const resultPath = runtimeFile('result', 'MCP_CATALOG_AGENT_RESULT_PATH');
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        generatedAt: plan.generatedAt,
        dryRun,
        enabled,
        coverage: plan.coverage,
        measured: plan.counts.measured,
        withdrawals,
        vendored,
      },
      null,
      2
    )
  );

  if (vendored.length > 0) {
    const marksPath = runtimeFile('marks', 'MCP_CATALOG_AGENT_MARKS_PATH');
    const bodyPath = runtimeFile('marksBody', 'MCP_CATALOG_AGENT_MARKS_BODY_PATH');
    writeFileSync(marksPath, JSON.stringify(vendored, null, 2));
    writeFileSync(
      bodyPath,
      [
        'One batched pull request of brand marks the catalogue agent sourced and shipped.',
        '',
        '| Row | Mark | Source |',
        '| --- | ---- | ------ |',
        ...vendored.map(
          (mark) => `| \`${mark.registryName}\` | \`${mark.path}\` | ${mark.source} |`
        ),
        '',
        'Each row waits as `repo_pr_pending`; the first run after this merges publishes it.',
        '',
        'Part of #1293.',
        '',
      ].join('\n')
    );
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = argv[0] ?? 'plan';

  // The job's later steps — the model step included — find these files through
  // the directory this run made, so it is published before anything is written.
  if (command === 'plan' || command === 'apply') announceRuntimeDir();

  if (command === 'plan') {
    const result = await plan();
    writeFileSync(planPath(), JSON.stringify(result, null, 2));

    const report = summary(
      result,
      result.entries.map(
        (entry) =>
          `- \`${entry.registryName}\` — ${
            entry.withdraw
              ? 'withdraw'
              : entry.skip
                ? `waiting: ${entry.skip}`
                : entry.published
                  ? `already published${entry.needsMark ? ', needs a mark' : ''}${entry.needsCopy ? ', needs copy' : ''}`
                  : `${entry.class}${entry.needsMark ? ', needs a mark' : ''}${entry.needsCopy ? ', needs copy' : ''}`
          }`
      )
    );
    process.stdout.write(report);
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
    }
    return;
  }

  if (command === 'apply') {
    await apply();
    return;
  }

  throw new Error(`unknown command: ${command} (expected plan or apply)`);
}
