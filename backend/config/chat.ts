import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createSupabaseChatRepository } from '@/backend/repositories/chat/supabase-chat-repository';
import { createSupabaseChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import { createSupabaseSkillTelemetryRepository } from '@/backend/repositories/chat/skill-telemetry-repository';
import { createSupabaseChatAgentActionRepository } from '@/backend/repositories/chat/chat-agent-action-repository';
import {
  ChatAgentActionService,
  type ChatAgentActionServiceDeps,
} from '@/backend/services/chat/chat-agent-action-service';
import {
  ChatAgentResumeService,
  type ChatAgentResumeDeps,
} from '@/backend/services/chat/chat-agent-resume-service';
import { openAgentTurnSession } from '@/backend/services/chat/agent-turn-session';
import { createChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import { createChatAttachmentSweepRepository } from '@/backend/repositories/chat/chat-attachment-sweep-repository';
import { ChatService, type ChatServiceDeps } from '@/backend/services/chat/chat-service';
import {
  ChatAgentService,
  type ChatAgentServiceDeps,
} from '@/backend/services/chat/chat-agent-service';
import { ChatAttachmentSweepService } from '@/backend/services/chat/chat-attachment-sweep';
import { attachAppNames } from '@/backend/services/chat/chat-app-tools';
import { appToolParts } from '@/shared/contracts/chat-agent-actions';
import {
  createPublicUsersRepositoryServer,
  createServerUserProfileRepository,
} from '@/backend/config/users';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { createDefaultMcpAppToolsService } from '@/backend/config/mcp';
import { createPlanGate, createUsageService } from '@/backend/config/plans';
import {
  createAgentRecallFor,
  createConversationSummaryFor,
  createMemoryExtractionFor,
} from '@/backend/config/agent-memory';
import { deferredAfter } from '@/backend/config/after';
import { env } from '@/backend/config/env';
import { createAiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { createTurnEmbedding } from '@/backend/services/agent/turn-embedding';
import { skillIndexDimensions } from '@/backend/services/chat/skill-index';
import { projectIdentity } from '@/backend/services/chat/turn-identity';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createAiChatClient, createJudgeAiChatClient } from '@/backend/clients/ai-chat';
import { createChatAgentJudge } from '@/backend/services/chat/chat-agent-judge-service';
import { createWebSearchClient, searchLanguageFor } from '@/backend/clients/web-search';
import { createUrlExtractClient } from '@/backend/clients/url-extract';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { USAGE_COUNTERS } from '@/shared/contracts/plans';

/**
 * Chat's wiring. The service runs on the caller's own client, so every read and
 * write goes through RLS; the only service-role read is the member-directory
 * hydration of a roster (`public/users` is not readable by a session), and it
 * projects the same public columns the directory does.
 */
export function createSupabaseChatService(
  supabase: SupabaseClient<Database>,
  deps: Partial<ChatServiceDeps> = {}
): ChatService {
  const users = createPublicUsersRepositoryServer();

  return new ChatService(createSupabaseChatRepository(supabase), {
    users: {
      getById: (id) => users.getById(id),
      getByUsername: (username) => users.getByUsername(username),
      getMany: (ids) => users.getMany(ids),
      search: (query, limit) => users.search(query, limit),
    },
    checkRateLimit: (key, limit, windowMs) =>
      checkRateLimit(key, limit, windowMs, { failClosed: true }),
    // The bucket is private and its policies ask the same membership question
    // the table does, so signing and removal run on the caller's own session.
    attachments: createChatAttachmentStorage(supabase),
    // A proposal is read on the same session, so a member sees only the cards
    // of a thread they are in (#818). A card that names one of their connected
    // apps resolves that app's current name here, from their own connections:
    // the row keeps `app:<connectionId>:<tool>` so a rename never orphans it.
    actions: {
      listForMessages: async (userId, messageIds) => {
        const rows =
          await createSupabaseChatAgentActionRepository(supabase).listForMessages(messageIds);
        const connectionIds = [
          ...new Set(
            rows.flatMap((row) => {
              const parts = appToolParts(row.tool);
              return parts ? [parts.connectionId] : [];
            })
          ),
        ];
        if (connectionIds.length === 0) return rows;

        // A name we cannot resolve (a disconnected app) leaves the card
        // readable, which is the whole point of storing the id.
        const names = await createDefaultMcpAppToolsService()
          .names(userId, connectionIds)
          .catch(() => new Map<string, string>());
        return attachAppNames(rows, names);
      },
    },
    // A request is delivered on the service role: `notifications` grants INSERT
    // to `service_role` only, and the producer is fail-safe by contract.
    notify: createAdminNotificationProducer(),
    ...deps,
  });
}

/**
 * The sweep's wiring. It is the one chats path that runs on the service role,
 * and it reads paths rather than messages: an orphan object has no row and no
 * member to read it through.
 */
export function createChatAttachmentSweepService(): ChatAttachmentSweepService {
  return new ChatAttachmentSweepService(createChatAttachmentSweepRepository(getAdminSupabase()));
}

/**
 * The assistant's wiring (ADR-0113, #817).
 *
 * Two seams meet here. Reads — the thread, its history — run on the caller's own
 * client, exactly like every other chats read. The one service-role write is the
 * assistant's reply, which the RLS insert policy cannot allow for a session
 * (`sender_kind = 'agent'`), plus one aggregate allowance read. The provider is
 * resolved per request from `AI_CHAT_*`, so an environment without a key renders
 * the assistant as unavailable rather than failing a request.
 */
export function createSupabaseChatAgentService(
  supabase: SupabaseClient<Database>,
  deps: Partial<ChatAgentServiceDeps> = {}
): ChatAgentService {
  const gate = createPlanGate();
  const usage = createUsageService();
  const apps = createDefaultMcpAppToolsService();
  // The member's own client: `/api/me` and the profile editor read the same
  // repository, so the block and the header menu cannot disagree about a name.
  const profiles = createServerUserProfileRepository(supabase);
  // One provider instance for the service: the turn streams through it and the
  // extraction behind the turn answers with it, so the deployment has one key,
  // one model and one place to change either.
  const client = createAiChatClient();
  // The reviewer is a second model on the same key (ADR-0213). It only scores a
  // finished draft and asks the writer for one rewrite; it never writes member
  // text or calls a tool. `AI_CHAT_JUDGE_MODEL=off` keeps the pre-gate turn.
  const judge = createChatAgentJudge(createJudgeAiChatClient());
  // The web, when the deployment has a search key (ADR-0206). No key is no
  // client, and the turn then declares no search tool at all.
  const search = createWebSearchClient();
  // The page reader shares the search key and the search allowance (ADR-0214).
  const urlExtract = createUrlExtractClient();

  // The specialist shortlist reads the roster's own artifact, so its width is
  // the artifact's, not the memory table's (#1448). A deployment with no
  // embedding provider passes no vector and ranks by words — the turn is the
  // turn it always was, with a shorter catalogue to guess from.
  const skillDimensions = skillIndexDimensions();
  const embedding = createTurnEmbedding(
    skillDimensions ? createAiEmbeddingsClient({ dimensions: skillDimensions }) : null
  );

  return new ChatAgentService({
    agent: createSupabaseChatAgentRepository(getAdminSupabase()),
    // Which specialists a turn was offered and read (#1449). Service role like
    // the turn row it points at: the member reads their answer, never this.
    telemetry: createSupabaseSkillTelemetryRepository(getAdminSupabase()),
    chats: createSupabaseChatService(supabase),
    reserve: (userId) => gate.reserve({ userId }, USAGE_COUNTERS.chatAgentTurns),
    // Every remote call a turn makes is its own counted action (#1226): one
    // counter for both directions, because a read causes the same egress.
    reserveAppCall: (userId) => gate.reserve({ userId }, USAGE_COUNTERS.mcpCalls),
    // The web is one counted search inside the member's turn (ADR-0206): the
    // gate releases the count when the vendor call failed, and the project
    // ceiling is what keeps the shared free month from being spent in a week.
    ...(search
      ? {
          search: {
            run: (userId: string, query: string, signal: AbortSignal) =>
              gate.count({ userId }, USAGE_COUNTERS.webSearches, () =>
                search.search(query, { language: searchLanguageFor(query), signal })
              ),
          },
        }
      : {}),
    ...(urlExtract
      ? {
          urlExtract: {
            run: (userId: string, url: string, question: string, signal: AbortSignal) =>
              gate.count({ userId }, USAGE_COUNTERS.webSearches, () =>
                urlExtract.extract(url, question, { signal })
              ),
          },
        }
      : {}),
    // The composer's app meter reads the same catalogue the pricing page does
    // (ADR-0093), so the number on screen and the number enforced are one.
    usageState: (userId) => usage.state(userId),
    client,
    judge,
    // Facts nobody typed, written after the answer (ADR-0182 decision 2,
    // #1511). Off unless `MEMORY_EXTRACTION` says otherwise: it is one provider
    // call per turn and a row on the member's behalf, so switching it on is a
    // decision that can point at a measurement.
    extraction: env.memoryExtractionEnabled ? createMemoryExtractionFor(client) : undefined,
    // The extraction must outlive the response that triggered it: `after()`
    // keeps the instance alive until it settles, which a bare promise cannot.
    defer: deferredAfter,
    // The voice note's bytes are read back through the member's own session, so
    // the bucket's policy is what decides whether a turn may hear it.
    attachments: createChatAttachmentStorage(supabase),
    // The assistant writes the proposal with the service role (a member must
    // not be able to forge one); the member's own confirmation is a separate
    // service, on their own session.
    actions: createSupabaseChatAgentActionService(supabase),
    // Who the turn is talking to, before it asks anything (ADR-0182, decision
    // 1): the account row plus the plan the gate just read, so "من أنا؟" costs
    // no tool call. A read that fails leaves the block out; it never refuses the
    // answer, and the address never enters the block (see `turn-identity`).
    identity: async (userId, plan) => {
      const [profile, connected] = await Promise.all([
        profiles.getById(userId).catch(() => null),
        apps.connectedCount(userId).catch(() => 0),
      ]);
      return projectIdentity({ profile, plan, connectedApps: connected });
    },
    // What the member asked to be remembered, recalled for this message
    // (ADR-0182, decision 3). The search runs on the member's own client, so a
    // fact they deleted is unreachable even with a stale vector; the query
    // vector is the one embedding call a turn's read path spends.
    recall: createAgentRecallFor(supabase),
    // The turn's one query vector (#1448): the recall above and the specialist
    // shortlist both read it, so a message costs one embedding and not two.
    queryVector: embedding.vector,
    // The beginning of a thread the window has already dropped (ADR-0182,
    // decision 4): read on the member's session and injected as its own block,
    // regenerated behind the answer once ten more messages have arrived. The
    // service applies both gates, so a turn that does not clear them spends
    // nothing.
    summary: createConversationSummaryFor(supabase, client),
    // The apps the member connected, when the marketplace is configured: the
    // turn declares at most sixteen of their tools, and a write among them is a
    // card like any other (ADR-0155, decision 7).
    apps,
    ...deps,
  });
}

/**
 * The worker's wiring.
 *
 * The session is minted per turn and never stored, the row is the claim, and the
 * assistant runs over the minted session so every read is still RLS-shaped.
 */
export function createChatAgentResumeService(
  deps: Partial<ChatAgentResumeDeps> = {}
): ChatAgentResumeService {
  return new ChatAgentResumeService({
    turns: createSupabaseChatAgentRepository(getAdminSupabase()),
    openSession: (userId) => openAgentTurnSession(userId),
    service: (supabase) => createSupabaseChatAgentService(supabase),
    ...deps,
  });
}

/**
 * The proposals (ADR-0113, #818).
 *
 * Reads and resolutions run on the caller's own client, so a member resolves
 * their own rows and nobody else's. The one service-role write is the proposal
 * itself, and the one service-role read behind it is the assistant's line.
 */
export function createSupabaseChatAgentActionService(
  supabase: SupabaseClient<Database>,
  deps: Partial<ChatAgentActionServiceDeps> = {}
): ChatAgentActionService {
  const admin = getAdminSupabase();
  const gate = createPlanGate();

  return new ChatAgentActionService({
    actions: createSupabaseChatAgentActionRepository(supabase, admin),
    agent: createSupabaseChatAgentRepository(admin),
    chats: createSupabaseChatService(supabase),
    // A confirmed card for one of the member's apps is a call on that app's
    // server, made with the member's own grant (#1225) — and counted like any
    // other remote call (#1226). A card the member declines never gets here.
    apps: createDefaultMcpAppToolsService(),
    // A confirmed generation stores its bytes through the same private bucket
    // a turn uses, so the thread's signed URL reads them from our own storage.
    attachments: createChatAttachmentStorage(admin),
    reserveAppCall: (userId) => gate.reserve({ userId }, USAGE_COUNTERS.mcpCalls),
    ...deps,
  });
}
