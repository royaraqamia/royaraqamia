'use client';

import { useEffect, useState } from 'react';

import { BELOW_SM_MEDIA_QUERY } from '@/frontend/ui/shared/breakpoints';

/** True below Tailwind's `sm` breakpoint, where pickers surface as bottom sheets. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(BELOW_SM_MEDIA_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isMobile;
}
