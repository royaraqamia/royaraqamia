'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

const POLL_INTERVAL = 60_000;

export function VersionChecker() {
  const currentVersion = useRef<string | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      const { version } = await res.json();

      if (currentVersion.current === null) {
        currentVersion.current = version;
        return;
      }

      if (version !== currentVersion.current) {
        toast.info('Update available', {
          description: 'A new version of the site is ready.',
          duration: Infinity,
          action: {
            label: 'Reload',
            onClick: () => window.location.reload(),
          },
        });
      }
    } catch {
      // silent — network issues shouldn't annoy users
    }
  }, []);

  useEffect(() => {
    checkVersion();

    const id = setInterval(checkVersion, POLL_INTERVAL);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', checkVersion);
    };
  }, [checkVersion]);

  return null;
}
