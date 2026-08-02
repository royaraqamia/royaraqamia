import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import type {
  IOtpRepository,
  OtpVerificationResult,
} from '@/backend/repositories/otp/otp-repository';

export class SupabaseOtpRepository implements IOtpRepository {
  async createOtpRecord(
    email: string,
    otpHash: string,
    salt: string,
    expiresAt: Date
  ): Promise<void> {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('otp_codes').insert({
      email,
      otp_hash: otpHash,
      salt,
      expires_at: expiresAt.toISOString(),
      max_attempts: 5,
    });
    if (error) throw error;
  }

  async verifyOtpRecord(email: string, otp: string): Promise<OtpVerificationResult> {
    const supabase = getAdminSupabase();

    const { data: record, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !record) return { error: 'لم يتم العثور على رمز التحقق' };

    if (new Date(record.expires_at) < new Date()) return { error: 'انتهت صلاحية رمز التحقق' };

    if (record.attempts >= record.max_attempts)
      return { error: 'تم تجاوز الحد الأقصى لمحاولات التحقق' };

    const { verifyOtp: verifyOtpFn } = await import('@/backend/shared/otp/generator');
    const isValid = verifyOtpFn(otp, record.otp_hash, record.salt);

    if (!isValid) {
      await supabase
        .from('otp_codes')
        .update({ attempts: record.attempts + 1 })
        .eq('id', record.id);
      return { error: 'رمز التحقق غير صحيح' };
    }

    await supabase
      .from('otp_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', record.id);

    return { success: true };
  }
}

export function createOtpRepository(): IOtpRepository {
  return new SupabaseOtpRepository();
}

export async function createOtpRecord(
  email: string,
  otpHash: string,
  salt: string,
  expiresAt: Date
): Promise<void> {
  return createOtpRepository().createOtpRecord(email, otpHash, salt, expiresAt);
}

export async function verifyOtpRecord(email: string, otp: string): Promise<OtpVerificationResult> {
  return createOtpRepository().verifyOtpRecord(email, otp);
}
