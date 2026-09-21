import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createCertificatesRepository } from '@/backend/repositories/certificates';
import { getAdminSupabase, getPublicSupabase } from '@/backend/config/supabase';
import { createCertificateVerifier } from '@/backend/services/certificates/certificate-verification';
import {
  CertificatesService,
  type CertificateIssuedNotifier,
} from '@/backend/services/certificates/certificates-service';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';
import type { Database } from '@/backend/models/database.types';
import type { VerifyResult } from '@/shared/contracts/certificates';

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

export function verifyCertificateByCode(code: string, ip: string): Promise<VerifyResult> {
  return createDefaultCertificateVerifier().verifyCertificateByCode(code, ip);
}

/** Admin client wiring for certificate management endpoints. */
export function createAdminCertificatesService(
  supabase?: SupabaseClient<Database>
): CertificatesService {
  return createCertificatesService(supabase ?? getAdminSupabase());
}

export function createCertificatesService(supabase: SupabaseClient<Database>): CertificatesService {
  return new CertificatesService(
    createCertificatesRepository(supabase),
    createCertificateIssuedNotifier()
  );
}

/**
 * Fire-and-forget: when a certificate is issued with selected recipients, the
 * shared fan-out resolves them to existing users and delivers one batched
 * `certificate_issued` insert plus one push fan-out, never throwing. A stale id
 * is filtered out rather than failing the batch.
 */
export function createCertificateIssuedNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): CertificateIssuedNotifier {
  return ({ recipientUserIds, certificate }) => {
    void fanOut(
      {
        type: 'certificate_issued',
        title: 'تمَّ إصدار شهادة لك',
        body: `شهادة "${certificate.course_name}" باسم ${certificate.student_name} صادرة عن رؤية رقمية.`,
        metadata: {
          certificateId: certificate.id,
          certificateCode: certificate.certificate_code,
          courseName: certificate.course_name,
        },
      },
      { recipientIds: recipientUserIds }
    );
  };
}
