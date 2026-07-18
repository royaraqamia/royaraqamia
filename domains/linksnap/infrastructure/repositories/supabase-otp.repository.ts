import { getAdminSupabase } from '@/domains/linksnap/infrastructure/supabase/client';
import {
  OtpRecord,
  OtpRepository,
} from '@/domains/linksnap/domain/interfaces/otp-repository.interface';
import { OTP_MAX_ATTEMPTS } from '@/domains/linksnap/domain/services/otp-config';

export class SupabaseOtpRepository implements OtpRepository {
  async create(email: string, otpHash: string, salt: string, expiresAt: Date): Promise<OtpRecord> {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('otp_codes')
      .insert({
        email,
        otp_hash: otpHash,
        salt,
        expires_at: expiresAt.toISOString(),
        max_attempts: OTP_MAX_ATTEMPTS,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create OTP: ${error.message}`);
    return this.mapRecord(data);
  }

  async findLatestByEmail(email: string): Promise<OtpRecord | null> {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('otp_codes')
      .select()
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to find OTP: ${error.message}`);
    if (!data) return null;
    return this.mapRecord(data);
  }

  async incrementAttempts(id: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.rpc('increment_otp_attempts', { row_id: id });

    if (error) {
      throw new Error(`Failed to increment OTP attempts: ${error.message}`);
    }
  }

  async markVerified(id: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from('otp_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(`Failed to mark OTP verified: ${error.message}`);
  }

  async invalidatePrevious(email: string): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from('otp_codes')
      .update({ expires_at: new Date(0).toISOString() })
      .eq('email', email)
      .is('verified_at', null);

    if (error) {
      console.error('Failed to invalidate previous OTPs:', error.message);
    }
  }

  private mapRecord(data: Record<string, unknown>): OtpRecord {
    return {
      id: data.id as string,
      email: data.email as string,
      otpHash: data.otp_hash as string,
      salt: data.salt as string,
      expiresAt: new Date(data.expires_at as string),
      attempts: data.attempts as number,
      maxAttempts: data.max_attempts as number,
      verifiedAt: data.verified_at ? new Date(data.verified_at as string) : null,
      createdAt: new Date(data.created_at as string),
    };
  }
}
