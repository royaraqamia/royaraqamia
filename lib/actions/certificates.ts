'use server';

import {
  verifyCertificateByCode,
  type Certificate,
  type VerifyResult,
} from '@/lib/certificate-verification';
import { headers } from 'next/headers';

export type { Certificate, VerifyResult };

export async function verifyCertificate(code: string): Promise<VerifyResult> {
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';

  return verifyCertificateByCode(code, ip);
}
