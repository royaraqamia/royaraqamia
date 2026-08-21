'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@/frontend/api/version';

const POLL_INTERVAL = 60_000;
const REMIND_INTERVAL = 30 * 60_000;

export interface AppVersionState {
  hasUpdate: boolean;
  releaseVersion: string | null;
  checkVersion: () => Promise<void>;
  dismissVersion: () => void;
}

const semverOf = (releaseVersion: string) => releaseVersion.split('+')[0] ?? releaseVersion;

export function useAppVersion(): AppVersionState {
  const baselineSemver = useRef<string | null>(null);
  const latestSemver = useRef<string | null>(null);
  const dismissed = useRef<{ semver: string | null; at: number } | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const versionInfo = await getVersion();
      const semver = semverOf(versionInfo.releaseVersion);
      latestSemver.current = semver;

      if (baselineSemver.current === null) {
        baselineSemver.current = semver;
        setReleaseVersion(versionInfo.releaseVersion);
        return;
      }

      const dismissedRecently =
        dismissed.current !== null &&
        semver === dismissed.current.semver &&
        Date.now() - dismissed.current.at < REMIND_INTERVAL;

      if (semver !== baselineSemver.current && !dismissedRecently) {
        setHasUpdate(true);
        setReleaseVersion(versionInfo.releaseVersion);
      }
    } catch {
      // silent
    }
  }, []);

  const dismissVersion = useCallback(() => {
    dismissed.current = { semver: latestSemver.current, at: Date.now() };
    setHasUpdate(false);
  }, []);

  useEffect(() => {
    checkVersion();
    // Skip network work while the tab is hidden; visibilitychange re-checks
    // the moment the user returns, so update detection stays immediate.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') checkVersion();
    }, POLL_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkVersion);
    };
  }, [checkVersion]);

  return { hasUpdate, releaseVersion, checkVersion, dismissVersion };
}
