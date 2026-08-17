'use client';

import { useEffect, useState, useCallback } from 'react';
import { UpdatePopup } from './UpdatePopup';
import { usePWAContext } from './PWAProvider';
import { useAppVersion } from '@/frontend/state/use-app-version';

export function VersionChecker() {
  const [showUpdate, setShowUpdate] = useState(false);
  const { registration } = usePWAContext();
  const { hasUpdate: hasVersionUpdate, releaseVersion, dismissVersion } = useAppVersion();

  useEffect(() => {
    if (hasVersionUpdate) {
      setShowUpdate(true);
    }
  }, [hasVersionUpdate]);

  const handleReload = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdate(false);
    window.location.reload();
  }, [registration]);

  const handleDismiss = useCallback(() => {
    setShowUpdate(false);
    dismissVersion();
  }, [dismissVersion]);

  return showUpdate ? (
    <UpdatePopup
      releaseVersion={releaseVersion}
      onReload={handleReload}
      onDismiss={handleDismiss}
    />
  ) : null;
}
