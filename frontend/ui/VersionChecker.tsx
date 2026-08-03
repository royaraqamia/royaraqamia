'use client';

import { useEffect, useState, useCallback } from 'react';
import { UpdatePopup } from './UpdatePopup';
import { usePWAContext } from './PWAProvider';
import { useAppVersion } from '@/frontend/state/use-app-version';

export function VersionChecker() {
  const [showUpdate, setShowUpdate] = useState(false);
  const { hasUpdate: hasPwaUpdate, registration, dismissUpdate } = usePWAContext();
  const { hasUpdate: hasVersionUpdate } = useAppVersion();

  useEffect(() => {
    if (hasPwaUpdate || hasVersionUpdate) {
      setShowUpdate(true);
    }
  }, [hasPwaUpdate, hasVersionUpdate]);

  const handleReload = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdate(false);
    window.location.reload();
  }, [registration]);

  const handleDismiss = useCallback(() => {
    setShowUpdate(false);
    dismissUpdate();
  }, [dismissUpdate]);

  return showUpdate ? <UpdatePopup onReload={handleReload} onDismiss={handleDismiss} /> : null;
}
