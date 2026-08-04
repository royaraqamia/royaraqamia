import 'server-only';

import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createDefaultCertificateVerifier } from '@/backend/config/certificates';
import type { Certificate } from '@/shared/contracts/certificates';

export async function loadCertificateByCode(code: string): Promise<Certificate | null> {
  try {
    const supabase = await createServerSupabaseClient();
    return await createDefaultCertificateVerifier(supabase).getCertificateByCode(code);
  } catch {
    return null;
  }
}
