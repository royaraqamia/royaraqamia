'use server';

import { verifyCertificateByCode } from '@/lib/certificate-verification';
import { headers } from 'next/headers';
import type { VerifyResult } from '@/lib/certificate-verification';

export async function verifyCertificate(code: string): Promise<VerifyResult> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';

    return await verifyCertificateByCode(code, ip);
  } catch (e) {
    return {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    };
  }
}
