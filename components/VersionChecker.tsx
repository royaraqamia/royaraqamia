'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { UpdatePopup } from './UpdatePopup';

const POLL_INTERVAL = 60_000;

export function VersionChecker() {
  const currentVersion = useRef<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

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

  return showUpdate ? <UpdatePopup onDismiss={() => setShowUpdate(false)} /> : null;
}
