import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { OtpRepository, OtpRecordData } from '@/backend/repositories/otp/otp-repository';

export class SupabaseOtpRepository implements OtpRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async createOtpRecord(input: {
    email: string;
    otpHash: string;
    salt: string;
    expiresAt: Date;
    maxAttempts: number;
  }): Promise<void> {
    const supabase = this.supabase;
    const { error } = await supabase.from('otp_codes').insert({
      email: input.email,
      otp_hash: input.otpHash,
      salt: input.salt,
      expires_at: input.expiresAt.toISOString(),
      max_attempts: input.maxAttempts,
    });
    if (error) throw error;
  }

  async findLatestPendingOtp(email: string): Promise<OtpRecordData | null> {
    const supabase = this.supabase;

    const { data, error } = await supabase
      .from('otp_codes')
      .select('id, otp_hash, salt, expires_at, attempts, max_attempts')
      .eq('email', email)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      otpHash: data.otp_hash,
      salt: data.salt,
      expiresAt: new Date(data.expires_at),
      attempts: data.attempts,
      maxAttempts: data.max_attempts,
    };
  }

  async incrementOtpAttempts(id: string, currentAttempts: number): Promise<void> {
    const supabase = this.supabase;
    const { error } = await supabase
      .from('otp_codes')
      .update({ attempts: currentAttempts + 1 })
      .eq('id', id);
    if (error) throw error;
  }

  async markOtpVerified(id: string): Promise<void> {
    const supabase = this.supabase;
    const { error } = await supabase
      .from('otp_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
