'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion, type VersionInfo } from '@/frontend/api/version';

const POLL_INTERVAL = 60_000;

export interface AppVersionState {
  hasUpdate: boolean;
  releaseVersion: string | null;
  checkVersion: () => Promise<void>;
}

export function useAppVersion(): AppVersionState {
  const currentVersion = useRef<VersionInfo['version'] | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const versionInfo = await getVersion();

      if (currentVersion.current === null) {
        currentVersion.current = versionInfo.version;
        setReleaseVersion(versionInfo.releaseVersion);
        return;
      }

      if (versionInfo.version !== currentVersion.current) {
        setHasUpdate(true);
        setReleaseVersion(versionInfo.releaseVersion);
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

  return { hasUpdate, releaseVersion, checkVersion };
}
