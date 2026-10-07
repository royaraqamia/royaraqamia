'use client';

import { BELOW_SM_MEDIA_QUERY } from '@/frontend/ui/shared/breakpoints';
import { useMediaQuery } from '@/frontend/ui/shared/use-media-query';

/** True below Tailwind's `sm` breakpoint, where pickers surface as bottom sheets. */
export function useIsMobile(): boolean {
  return useMediaQuery(BELOW_SM_MEDIA_QUERY);
}
