'use server';

import { verifyCertificateByCode } from '@/backend/services/certificate-verification';
import { headers } from 'next/headers';
import { getForwardedIp } from '@/backend/shared/request-utils';
import type { VerifyResult } from '@/shared/contracts/certificates';

export async function verifyCertificate(code: string): Promise<VerifyResult> {
  try {
    const headerStore = await headers();
    const ip = getForwardedIp(headerStore);

    return await verifyCertificateByCode(code, ip);
  } catch (e) {
    return {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    };
  }
}
