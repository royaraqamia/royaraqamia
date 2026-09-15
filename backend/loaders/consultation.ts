import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { createSettingsReaderService } from '@/backend/config/consultation';
import { CONSULTATION_TAGS } from '@/backend/shared/consultation-cache-tags';
import type { ConsultationPackage, ConsultationSettings } from '@/shared/contracts/consultation';

const CONSULTATION_CACHE_SECONDS = 60;

/** Active packages for the booking wizard. Changes only from the admin
 * dashboard, so it is data-cached and invalidated by the packages tag. */
export const loadActiveConsultationPackages = unstable_cache(
  async (): Promise<ConsultationPackage[]> => {
    try {
      return await createSettingsReaderService().getActivePackages();
    } catch (error) {
      Sentry.captureException(error);
      return [];
    }
  },
  ['consultation-packages'],
  { revalidate: CONSULTATION_CACHE_SECONDS, tags: [CONSULTATION_TAGS.packages] }
);

/** Payment/WhatsApp display settings. Data-cached and invalidated by the
 * settings tag on admin save. */
export const loadConsultationSettings = unstable_cache(
  async (): Promise<Partial<ConsultationSettings>> => {
    try {
      return await createSettingsReaderService().getSettings();
    } catch (error) {
      Sentry.captureException(error);
      return {};
    }
  },
  ['consultation-settings'],
  { revalidate: CONSULTATION_CACHE_SECONDS, tags: [CONSULTATION_TAGS.settings] }
);
