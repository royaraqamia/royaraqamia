import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import type { AgentToolGrant } from '@/shared/contracts/agent-tool-grants';

type GrantRow = Database['public']['Tables']['agent_tool_grants']['Row'];

/**
 * The member's tool grants (ADR-0180 decisions 2 and 3, #1438).
 *
 * Reads and revocation run on the caller's own client, so RLS is the boundary:
 * a member sees and revokes only their rows. The two writes the server owns —
 * creating a grant after its tier and "seen it run once" checks, and touching
 * `last_used_at` when a grant causes a run — run on the service role, because a
 * client that could insert a row would be able to name any tool, including one
 * the executor must never make automatic.
 */
export interface AgentToolGrantRepository {
  listLive(userId: string): Promise<AgentToolGrant[]>;
  findLive(userId: string, toolId: string): Promise<AgentToolGrant | null>;
  create(input: { userId: string; toolId: string; grantedFrom: string }): Promise<AgentToolGrant>;
  revoke(userId: string, id: string, at: string): Promise<AgentToolGrant | null>;
  touch(id: string, at: string): Promise<void>;
  /** The tools this member has seen finish, which is the grant's precondition. */
  appliedTools(userId: string, toolIds: string[]): Promise<string[]>;
}

function toRecord(row: GrantRow, label: string): AgentToolGrant {
  return {
    id: row.id,
    toolId: row.tool_id,
    label,
    grantedAt: row.granted_at,
    lastUsedAt: row.last_used_at,
  };
}

export function createSupabaseAgentToolGrantRepository(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database> = supabase
): AgentToolGrantRepository {
  return {
    async listLive(userId) {
      const { data, error } = await supabase
        .from('agent_tool_grants')
        .select('*')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('granted_at', { ascending: false });

      if (error) throw repositoryFailure('agent.toolGrants.list', error);
      return data.map((row) => toRecord(row, row.tool_id));
    },

    async findLive(userId, toolId) {
      const { data, error } = await supabase
        .from('agent_tool_grants')
        .select('*')
        .eq('user_id', userId)
        .eq('tool_id', toolId)
        .is('revoked_at', null)
        .maybeSingle();

      if (error) throw repositoryFailure('agent.toolGrants.find', error);
      return data ? toRecord(data, data.tool_id) : null;
    },

    async create(input) {
      const { data, error } = await admin
        .from('agent_tool_grants')
        .insert({
          user_id: input.userId,
          tool_id: input.toolId,
          granted_from: input.grantedFrom,
        })
        .select()
        .single();

      if (error) throw repositoryFailure('agent.toolGrants.create', error);
      return toRecord(data, data.tool_id);
    },

    async revoke(userId, id, at) {
      const { data, error } = await supabase
        .from('agent_tool_grants')
        .update({ revoked_at: at })
        .eq('id', id)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select()
        .maybeSingle();

      if (error) throw repositoryFailure('agent.toolGrants.revoke', error);
      return data ? toRecord(data, data.tool_id) : null;
    },

    async touch(id, at) {
      const { error } = await admin
        .from('agent_tool_grants')
        .update({ last_used_at: at })
        .eq('id', id);
      if (error) throw repositoryFailure('agent.toolGrants.touch', error);
    },

    async appliedTools(userId, toolIds) {
      if (toolIds.length === 0) return [];

      const { data, error } = await supabase
        .from('chat_agent_actions')
        .select('tool')
        .eq('resolved_by', userId)
        .eq('status', 'applied')
        .in('tool', toolIds);

      if (error) throw repositoryFailure('agent.toolGrants.seen', error);
      return [...new Set(data.map((row) => row.tool))];
    },
  };
}
