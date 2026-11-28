import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import {
  ASSISTANT_DEFAULT_NAME,
  ASSISTANT_DEFAULT_VOICE,
  ASSISTANT_KEY_DEFAULT,
  type AssistantIdentity,
  type AssistantIdentityInput,
  type AssistantTone,
} from '@/shared/contracts/assistant-identity';

type IdentityRow = Database['public']['Tables']['assistant_identities']['Row'];

/**
 * The member's own assistant identity (ADR-0224, ADR-0228).
 *
 * One row per member, read and written on the caller's own client: RLS is the
 * whole boundary, because nothing here is public and the service role never
 * needs another member's name. There is no history table and no second read —
 * the row is the record, and `updated_at` is written by this repository rather
 * than a trigger so the only writer stays visible in one file.
 */
export interface AssistantIdentityRepository {
  read(userId: string): Promise<AssistantIdentity | null>;
  upsert(userId: string, input: AssistantIdentityInput, at: string): Promise<AssistantIdentity>;
  /**
   * Point the row at an uploaded face, or clear it. Separate from `upsert` so a
   * name save — which carries no file — cannot blank a face it never read.
   */
  setAvatar(userId: string, avatarUrl: string | null, at: string): Promise<AssistantIdentity>;
  reset(userId: string): Promise<void>;
}

const TONES: readonly AssistantTone[] = ['default', 'concise', 'warm', 'formal'];

/** The row as the surfaces read it: the name is resolved, never nullable. */
function toIdentity(row: IdentityRow): AssistantIdentity {
  return {
    name: row.name ?? ASSISTANT_DEFAULT_NAME,
    customName: row.name,
    avatarVariant: row.avatar_variant,
    avatarUrl: row.avatar_url,
    voice: row.voice === 'masculine' ? 'masculine' : ASSISTANT_DEFAULT_VOICE,
    tone: TONES.includes(row.tone as AssistantTone) ? (row.tone as AssistantTone) : 'default',
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseAssistantIdentityRepository(
  supabase: SupabaseClient<Database>
): AssistantIdentityRepository {
  return {
    async read(userId) {
      const { data, error } = await supabase
        .from('assistant_identities')
        .select('*')
        .eq('user_id', userId)
        .eq('assistant_key', ASSISTANT_KEY_DEFAULT)
        .maybeSingle();

      if (error) throw repositoryFailure('assistant.identity.read', error);
      return data ? toIdentity(data) : null;
    },

    async upsert(userId, input, at) {
      const { data, error } = await supabase
        .from('assistant_identities')
        .upsert(
          {
            user_id: userId,
            assistant_key: ASSISTANT_KEY_DEFAULT,
            name: input.name,
            avatar_variant: input.avatarVariant,
            voice: input.voice,
            tone: input.tone,
            note: input.note,
            updated_at: at,
          },
          { onConflict: 'user_id,assistant_key' }
        )
        .select()
        .single();

      if (error) throw repositoryFailure('assistant.identity.upsert', error);
      return toIdentity(data);
    },

    /**
     * The upsert carries only the face, so Postgres updates those columns and
     * leaves the rest of the row alone; a member who uploads before ever saving
     * a name gets a row whose other fields are the table's defaults.
     */
    async setAvatar(userId, avatarUrl, at) {
      const { data, error } = await supabase
        .from('assistant_identities')
        .upsert(
          {
            user_id: userId,
            assistant_key: ASSISTANT_KEY_DEFAULT,
            avatar_url: avatarUrl,
            updated_at: at,
          },
          { onConflict: 'user_id,assistant_key' }
        )
        .select()
        .single();

      if (error) throw repositoryFailure('assistant.identity.avatar', error);
      return toIdentity(data);
    },

    async reset(userId) {
      const { error } = await supabase
        .from('assistant_identities')
        .delete()
        .eq('user_id', userId)
        .eq('assistant_key', ASSISTANT_KEY_DEFAULT);

      if (error) throw repositoryFailure('assistant.identity.reset', error);
    },
  };
}
