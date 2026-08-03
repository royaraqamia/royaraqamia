'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@/frontend/api/version';

const POLL_INTERVAL = 60_000;

export interface AppVersionState {
  hasUpdate: boolean;
  checkVersion: () => Promise<void>;
}

export function useAppVersion(): AppVersionState {
  const currentVersion = useRef<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const version = await getVersion();

      if (currentVersion.current === null) {
        currentVersion.current = version;
        return;
      }

      if (version !== currentVersion.current) {
        setHasUpdate(true);
      }
    } catch {
      // silent
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

  return { hasUpdate, checkVersion };
}
