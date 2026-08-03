import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createCertificatesRepository } from '@/backend/repositories/certificates';
import { getPublicSupabase } from '@/backend/transport/supabase/public';
import {
  createCertificateVerifier,
  type CertificateVerifier,
} from '@/backend/services/certificates/certificate-verification';
import { CertificatesService } from '@/backend/services/certificates/certificates-service';
import type { Database } from '@/backend/models/database.types';
import type { Certificate, VerifyResult } from '@/shared/contracts/certificates';

/**
 * Default wiring used by server actions. Uses the publishable (anon) key
 * via getPublicSupabase so RLS applies for public read-only lookups.
 */
export function createDefaultCertificateVerifier(supabase?: SupabaseClient<Database>) {
  const client = supabase ?? getPublicSupabase();
  return createCertificateVerifier({
    repository: createCertificatesRepository(client),
    checkRateLimit,
    captureMessage: (message, options) => Sentry.captureMessage(message, options),
    captureException: (error, options) => Sentry.captureException(error, options),
  });
}

let defaultVerifier: CertificateVerifier | null = null;

function getDefaultVerifier() {
  if (!defaultVerifier) {
    defaultVerifier = createDefaultCertificateVerifier();
  }
  return defaultVerifier;
}

/** Backwards-compatible export kept for server actions. */
export function verifyCertificateByCode(code: string, ip: string): Promise<VerifyResult> {
  return getDefaultVerifier().verifyCertificateByCode(code, ip);
}

export function getCertificateByCode(code: string): Promise<Certificate | null> {
  return getDefaultVerifier().getCertificateByCode(code);
}

export function createCertificatesService(supabase: SupabaseClient<Database>): CertificatesService {
  return new CertificatesService(createCertificatesRepository(supabase));
}
