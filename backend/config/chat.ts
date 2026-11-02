import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createSupabaseChatRepository } from '@/backend/repositories/chat/supabase-chat-repository';
import { createSupabaseChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import { createChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import { createChatAttachmentSweepRepository } from '@/backend/repositories/chat/chat-attachment-sweep-repository';
import { ChatService, type ChatServiceDeps } from '@/backend/services/chat/chat-service';
import {
  ChatAgentService,
  type ChatAgentServiceDeps,
} from '@/backend/services/chat/chat-agent-service';
import { ChatAttachmentSweepService } from '@/backend/services/chat/chat-attachment-sweep';
import { createPublicUsersRepositoryServer } from '@/backend/config/users';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { createPlanGate } from '@/backend/config/plans';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createAiChatClient } from '@/backend/clients/ai-chat';
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

  return new ChatAgentService({
    agent: createSupabaseChatAgentRepository(getAdminSupabase()),
    chats: createSupabaseChatService(supabase),
    reserve: (userId) => gate.reserve({ userId }, USAGE_COUNTERS.chatAgentTurns),
    client: createAiChatClient(),
    ...deps,
  });
}
