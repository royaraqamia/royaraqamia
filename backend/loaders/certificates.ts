import 'server-only';

import { unstable_cache } from 'next/cache';
import { createDefaultCertificateVerifier } from '@/backend/config/certificates';
import type { Certificate } from '@/shared/contracts/certificates';

const CERTIFICATE_CACHE_SECONDS = 60;

export const loadCertificateByCode = unstable_cache(
  async (code: string): Promise<Certificate | null> => {
    try {
      return await createDefaultCertificateVerifier().getCertificateByCode(code);
    } catch {
      return null;
    }
  },
  ['certificate-by-code'],
  { revalidate: CERTIFICATE_CACHE_SECONDS }
);
