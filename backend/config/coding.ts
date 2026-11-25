import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAiChatClient,
  type AiChatClient,
  type AiChatMessage,
  type AiChatTool,
  type AiChatWireMessage,
} from '@/backend/clients/ai-chat';
import { createGitHubAppClient } from '@/backend/clients/github-app';
import { env } from '@/backend/config/env';
import { createUsageService } from '@/backend/config/plans';
import { getAdminSupabase } from '@/backend/config/supabase';
import type { Database } from '@/backend/models/database.types';
import { createCodingAdminRepository, createCodingRepository } from '@/backend/repositories/coding';
import { encryptSecret, generateOpaqueToken, hashToken } from '@/backend/shared/mcp-token-crypto';
import type { CodingRepoInput } from '@/shared/contracts/coding-agent';

import {
  createCodingService,
  type CodingLlmClient,
  type CodingLlmResult,
  type CodingService,
  type CodingServiceDeps,
  type LlmMessage,
  type LlmTool,
} from '@/backend/services/coding/coding-service';
import { GitHubActionsRunner } from '@/backend/services/coding/github-actions-runner';

/**
 * Composition root for the coding agent's control plane (ADR-0219).
 *
 * The member-facing service runs on the caller's client, so RLS authorizes every
 * read and write. The runner service uses a service-role-backed repository
 * because an Actions job has no session; its only credential is the hashed,
 * task-scoped bearer token resolved here from the Authorization header.
 */

const CONNECT_TTL_MS = 10 * 60 * 1000;

export interface CodingRunnerAuth {
  rawToken: string;
  hash: string;
  userId: string;
  taskId: string;
}

/** A repository owner is stored on the installation row; the id is the repo API's key. */
function createInstallationIdLookup(): NonNullable<CodingServiceDeps['installationIdForRepo']> {
  return async (userId, owner) => {
    const { data, error } = await getAdminSupabase()
      .from('coding_installations')
      .select('installation_id')
      .eq('user_id', userId)
      .eq('account_login', owner)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const id = (data as { installation_id?: number | string } | null)?.installation_id;
    return id === undefined ? null : Number(id);
  };
}

/**
 * Install the workflow once per repository, through a PR the member reviews.
 * The template is served as a static file from this origin so a deployment never
 * depends on reading a file from its own bundle path.
 */
function createWorkflowBootstrapper(
  github: ReturnType<typeof createGitHubAppClient>,
  origin: string
): NonNullable<CodingServiceDeps['bootstrapWorkflow']> {
  return async ({ installationId, owner, name, defaultBranch }) => {
    const response = await fetch(`${origin}/coding/noor-coding.yml`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Workflow template is unavailable');
    const template = await response.text();

    const { token } = await github.getInstallationToken(installationId);
    const path = '.github/workflows/noor-coding.yml';
    const existing = await github.getFile({ token, owner, repo: name, path, ref: defaultBranch });
    if (existing) return null;

    const branch = 'noor-bootstrap';
    const { sha } = await github.getRef({
      token,
      owner,
      repo: name,
      ref: `heads/${defaultBranch}`,
    });
    await github.createRef({ token, owner, repo: name, ref: `refs/heads/${branch}`, sha });
    await github.createFile({
      token,
      owner,
      repo: name,
      path,
      branch,
      content: template,
      message: 'Add the نور coding workflow',
    });
    const pr = await github.createPullRequest({
      token,
      owner,
      repo: name,
      head: branch,
      base: defaultBranch,
      title: 'ربط نور بهذا المستودع',
      body: 'يعرّف هذا الملف التنفيذ الآمن لمهام نور البرمجية. راجعه ثم ادمجه قبل تشغيل أي مهمة.',
    });
    return pr.htmlUrl;
  };
}

/** Tool declarations are valid OpenAI functions; anything else is dropped. */
function asTools(tools: LlmTool[] | undefined): AiChatTool[] {
  return (tools ?? []).flatMap((tool) => {
    const fn = (
      tool as { function?: { name?: unknown; description?: unknown; parameters?: unknown } }
    ).function;
    if (!fn || typeof fn.name !== 'string') return [];
    return [
      {
        type: 'function' as const,
        function: {
          name: fn.name,
          description: typeof fn.description === 'string' ? fn.description : '',
          parameters:
            fn.parameters && typeof fn.parameters === 'object'
              ? (fn.parameters as Record<string, unknown>)
              : {},
        },
      },
    ];
  });
}

function asWireMessages(messages: LlmMessage[], tools: AiChatTool[]): AiChatWireMessage[] {
  const toolInstruction: AiChatMessage[] =
    tools.length > 0
      ? [
          {
            role: 'system',
            content: `Available tools (OpenAI function declarations): ${JSON.stringify(tools)}. Call a tool only with one of these names and write its arguments as JSON.`,
          },
        ]
      : [];

  return [
    ...toolInstruction,
    ...messages.map((message): AiChatWireMessage => {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: message.tool_call_id ?? '',
          content: message.content,
        };
      }
      if (message.role === 'assistant' && message.tool_calls?.length) {
        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.function.name, arguments: call.function.arguments },
          })),
        };
      }
      return { role: message.role, content: message.content };
    }),
  ];
}

/**
 * The provider adapter. `reply()` is the client's non-stream call; it has no
 * tool parameter today, so tool requests go through the tool-capable call and
 * are collapsed into one answer before anything reaches the runner — no SSE
 * crosses the control-plane boundary either way. A client that grows a
 * non-stream tool method is picked up here without touching the service.
 */
function createCodingLlmClient(): CodingLlmClient {
  return {
    async reply(request, signal) {
      const client: AiChatClient | null = createAiChatClient();
      if (!client) throw new Error('Assistant provider is not configured');

      const tools = asTools(request.tools);
      if (tools.length === 0) {
        const messages: AiChatMessage[] = request.messages.flatMap((message) =>
          message.role === 'tool' ? [] : [{ role: message.role, content: message.content }]
        );
        const text = await client.reply(messages, signal);
        return { message: { role: 'assistant', content: text } } satisfies CodingLlmResult;
      }

      const toolClient = client as AiChatClient & {
        replyWithTools?: (
          messages: AiChatWireMessage[],
          tools: AiChatTool[],
          signal: AbortSignal
        ) => Promise<{
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        }>;
      };
      const wire = asWireMessages(request.messages, tools);
      if (toolClient.replyWithTools) {
        const answer = await toolClient.replyWithTools(wire, tools, signal);
        return {
          message: {
            role: 'assistant',
            content: answer.content ?? null,
            ...(answer.tool_calls?.length
              ? {
                  tool_calls: answer.tool_calls.map((call) => ({
                    id: call.id ?? `call_${call.function?.name ?? 'tool'}`,
                    type: 'function' as const,
                    function: {
                      name: call.function?.name ?? '',
                      arguments: call.function?.arguments ?? '{}',
                    },
                  })),
                }
              : {}),
          },
        } satisfies CodingLlmResult;
      }

      let content = '';
      const calls = new Map<string, { id: string; name: string; arguments: string }>();
      for await (const event of client.streamWithTools(wire, tools, signal)) {
        if (event.type === 'text') {
          content += event.text;
          continue;
        }
        const id = event.call.id || `call_${event.call.name}`;
        const previous = calls.get(id);
        calls.set(id, {
          id,
          name: event.call.name || previous?.name || '',
          arguments: (previous?.arguments ?? '') + event.call.arguments,
        });
      }
      const tool_calls = [...calls.values()]
        .filter((call) => call.name)
        .map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments || '{}' },
        }));
      return {
        message: {
          role: 'assistant',
          content: content || null,
          ...(tool_calls.length > 0 ? { tool_calls } : {}),
        },
      } satisfies CodingLlmResult;
    },
  };
}

function sharedDeps(overrides: Partial<CodingServiceDeps>): Omit<CodingServiceDeps, 'repo'> {
  const admin = getAdminSupabase();
  const github = createGitHubAppClient();
  return {
    admin: createCodingAdminRepository(admin),
    runnerRepo: createCodingRepository(admin),
    github,
    runner: new GitHubActionsRunner(github),
    llm: createCodingLlmClient(),
    origin: env.origin,
    planFor: (userId) =>
      createUsageService()
        .state(userId)
        .then((state) => state.plan),
    installationIdForRepo: createInstallationIdLookup(),
    bootstrapWorkflow: createWorkflowBootstrapper(github, env.origin),
    ...overrides,
  };
}

/** Member requests: every data access is made with the caller's own session. */
export function createCodingServiceForUser(
  supabase: SupabaseClient<Database>,
  deps: Partial<CodingServiceDeps> = {}
): CodingService {
  return createCodingService({
    ...sharedDeps(deps),
    repo: createCodingRepository(supabase),
    ...deps,
  });
}

/** Runner callbacks: no session exists, so reads are on the service role. */
export function createCodingRunnerService(deps: Partial<CodingServiceDeps> = {}): CodingService {
  const admin = getAdminSupabase();
  return createCodingService({
    ...sharedDeps(deps),
    repo: createCodingRepository(admin),
    ...deps,
  });
}

/** Resolve the bearer only through its digest; the raw token never hits a row. */
export async function resolveCodingRunner(headers: Headers): Promise<CodingRunnerAuth | null> {
  const header = headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const rawToken = match?.[1]?.trim() ?? '';
  if (rawToken.length < 20) return null;
  const hash = hashToken(rawToken);
  const task = await createCodingAdminRepository(getAdminSupabase()).findTaskByCallbackHash(hash);
  if (!task) return null;
  return { rawToken, hash, userId: task.user_id, taskId: task.id };
}

/** Start the GitHub App connect: only the state digest is persisted. */
export async function startCodingConnect(userId: string): Promise<{ url: string }> {
  const state = generateOpaqueToken();
  await createCodingAdminRepository(getAdminSupabase()).saveConnectAttempt(
    hashToken(state),
    userId,
    new Date(Date.now() + CONNECT_TTL_MS).toISOString()
  );
  return { url: createGitHubAppClient().authorizeUrl(state) };
}

/** Exchange the one-time state, store every installation token encrypted. */
export async function completeCodingConnect(
  userId: string,
  state: string,
  code: string
): Promise<void> {
  const admin = createCodingAdminRepository(getAdminSupabase());
  const attempt = await admin.claimConnectAttempt(hashToken(state));
  if (!attempt) throw new Error('invalid_state');

  const github = createGitHubAppClient();
  const { accessToken } = await github.exchangeUserCode(code);
  const installations = await github.listInstallations(accessToken);
  for (const installation of installations) {
    const { token, expiresAt } = await github.getInstallationToken(installation.id);
    await admin.saveInstallation(userId, {
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type || 'User',
      repositorySelection: installation.repository_selection || 'selected',
      tokenEnc: encryptSecret(token),
      tokenExpiresAt: expiresAt,
    });
  }
}

export type { CodingRepoInput };
