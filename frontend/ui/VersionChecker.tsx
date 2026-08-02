'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { UpdatePopup } from './UpdatePopup';
import { usePWAContext } from './PWAProvider';

const POLL_INTERVAL = 60_000;

export function VersionChecker() {
  const currentVersion = useRef<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const { hasUpdate, registration, dismissUpdate } = usePWAContext();

  useEffect(() => {
    if (hasUpdate) {
      setShowUpdate(true);
    }
  }, [hasUpdate]);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      const { version } = await res.json();

      if (currentVersion.current === null) {
        currentVersion.current = version;
        return;
      }

      if (version !== currentVersion.current) {
        setShowUpdate(true);
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
