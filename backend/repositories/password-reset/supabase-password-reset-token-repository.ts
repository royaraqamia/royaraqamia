import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from '@/backend/repositories/password-reset/password-reset-token-repository';

export class SupabasePasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async createToken(input: {
    email: string;
    userId: string;
    tokenHash: string;
    salt: string;
    expiresAt: Date;
  }): Promise<void> {
    const { error } = await this.supabase.from('password_reset_tokens').insert({
      email: input.email,
      user_id: input.userId,
      token_hash: input.tokenHash,
      salt: input.salt,
      expires_at: input.expiresAt.toISOString(),
    });
    if (error) throw error;
  }

  async findLatestValidToken(email: string): Promise<PasswordResetTokenRecord | null> {
    const { data, error } = await this.supabase
      .from('password_reset_tokens')
      .select('id, token_hash, salt, expires_at, used_at, user_id, email')
      .eq('email', email)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      tokenHash: data.token_hash,
      salt: data.salt,
      expiresAt: new Date(data.expires_at),
      usedAt: data.used_at ? new Date(data.used_at) : null,
      userId: data.user_id,
      email: data.email,
    };
  }

  async markTokenAsUsed(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
