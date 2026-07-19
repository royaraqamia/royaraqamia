import { getAdminSupabase } from '@/lib/supabase/admin';

interface OtpRecord {
  id: string;
  email: string;
  otp_hash: string;
  salt: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  verified_at: string | null;
  created_at: string;
}

export async function createOtpRecord(
  email: string,
  otpHash: string,
  salt: string,
  expiresAt: Date
) {
  const supabase = getAdminSupabase();
  const { error } = await (supabase.from('otp_codes' as any) as any).insert({
    email,
    otp_hash: otpHash,
    salt,
    expires_at: expiresAt.toISOString(),
    max_attempts: 5,
  });
  if (error) throw error;
}

export async function verifyOtpRecord(email: string, otp: string) {
  const supabase = getAdminSupabase();

  const { data: record, error: fetchError } = await supabase
    .from('otp_codes' as any)
    .select('*')
    .eq('email', email)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !record) return { error: 'لم يتم العثور على رمز التحقق' };

  const otpRecord = record as unknown as OtpRecord;

  if (new Date(otpRecord.expires_at) < new Date()) return { error: 'انتهت صلاحية رمز التحقق' };

  if (otpRecord.attempts >= otpRecord.max_attempts)
    return { error: 'تم تجاوز الحد الأقصى لمحاولات التحقق' };

  const { verifyOtp: verifyOtpFn } = await import('@/lib/otp/generator');
  const isValid = verifyOtpFn(otp, otpRecord.otp_hash, otpRecord.salt);

  if (!isValid) {
    const { data: row } = await supabase
      .from('otp_codes' as any)
      .select('attempts')
      .eq('id', otpRecord.id)
      .single();
    await (supabase.from('otp_codes' as any) as any)
      .update({ attempts: ((row as any)?.attempts ?? 0) + 1 })
      .eq('id', otpRecord.id);
    return { error: 'رمز التحقق غير صحيح' };
  }

  await (supabase.from('otp_codes' as any) as any)
    .update({ verified_at: new Date().toISOString() })
    .eq('id', otpRecord.id);

  return { success: true };
}
