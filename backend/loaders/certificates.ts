import 'server-only';

import { unstable_cache } from 'next/cache';
import { createDefaultCertificateVerifier } from '@/backend/config/certificates';
import { toPublicCertificate, type PublicCertificate } from '@/shared/contracts/certificates';

const CERTIFICATE_CACHE_SECONDS = 60;

export const loadCertificateByCode = unstable_cache(
  async (code: string): Promise<PublicCertificate | null> => {
    const certificate = await createDefaultCertificateVerifier().getCertificateByCode(code);
    return certificate ? toPublicCertificate(certificate) : null;
  },
  ['certificate-by-code'],
  { revalidate: CERTIFICATE_CACHE_SECONDS }
);

/** All certificate codes, used by `generateStaticParams` to pre-render the
 * shared /verify/[code] pages at build time. Narrow projection (codes only). */
export const loadCertificateCodes = unstable_cache(
  (): Promise<string[]> => createDefaultCertificateVerifier().getCodes(),
  ['certificate-codes'],
  { revalidate: CERTIFICATE_CACHE_SECONDS }
);
