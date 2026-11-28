import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import { VisualRenderSpecSchema, type VisualRenderSpec } from '@/shared/contracts/visual';

type RenderRow = Database['public']['Tables']['chat_visual_renders']['Row'];

/** What a worker needs to render one clip: whose thread, and what to draw. */
export interface VisualRenderRow {
  id: string;
  conversationId: string;
  memberId: string;
  spec: VisualRenderSpec;
  attempts: number;
}

function toRow(row: RenderRow): VisualRenderRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    memberId: row.member_id,
    spec: VisualRenderSpecSchema.parse(row.spec),
    attempts: row.attempts,
  };
}

/**
 * The render queue, service-role only.
 *
 * The member never reads this table: what they read is the assistant message
 * the finished clip is attached to. The queue is a row with a lease, like the
 * abandoned-turn worker (ADR-0125), so a second wake cannot render the same
 * drawing twice.
 */
export interface VisualRenderRepository {
  /** One queued render for a turn that asked for motion. */
  enqueue(input: {
    conversationId: string;
    memberId: string;
    spec: VisualRenderSpec;
  }): Promise<void>;
  /** Queued rows, and rows whose lease expired, oldest first. */
  due(limit: number): Promise<string[]>;
  /** The lease: null when another worker won it, or it is no longer due. */
  claim(id: string): Promise<VisualRenderRow | null>;
  complete(id: string, outputPath: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

export function createSupabaseVisualRenderRepository(
  supabase: SupabaseClient<Database>
): VisualRenderRepository {
  return {
    async enqueue({ conversationId, memberId, spec }) {
      const { error } = await supabase.from('chat_visual_renders').insert({
        conversation_id: conversationId,
        member_id: memberId,
        spec,
      });
      if (error) throw repositoryFailure('chat.visualRender.enqueue', error);
    },

    async due(limit) {
      const { data, error } = await supabase.rpc('visual_renders_due', { p_limit: limit });
      if (error) throw repositoryFailure('chat.visualRender.due', error);
      return (data ?? []).map((row) => row.id);
    },

    async claim(id) {
      const { data, error } = await supabase.rpc('claim_visual_render', { p_id: id });
      if (error) throw repositoryFailure('chat.visualRender.claim', error);
      const row = (Array.isArray(data) ? data[0] : null) as RenderRow | null;
      return row ? toRow(row) : null;
    },

    async complete(id, outputPath) {
      const { error } = await supabase
        .from('chat_visual_renders')
        .update({
          status: 'done',
          output_path: outputPath,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw repositoryFailure('chat.visualRender.complete', error);
    },

    async fail(id, reason) {
      const { error } = await supabase
        .from('chat_visual_renders')
        .update({
          status: 'failed',
          error: reason.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw repositoryFailure('chat.visualRender.fail', error);
    },
  };
}
