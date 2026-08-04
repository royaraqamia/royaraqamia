'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { usePWA, type PWAState } from '../state/use-pwa';
import { IS_DEVELOPMENT } from '@/frontend/shared/constants';

const SW_PATH = '/sw.js';

interface PWAContextValue extends PWAState {
  promptInstall: () => Promise<boolean | undefined>;
  dismissUpdate: () => void;
}

const PWAContext = createContext<PWAContextValue | null>(null);

export function usePWAContext() {
  const ctx = useContext(PWAContext);
  if (!ctx) {
    throw new Error('usePWAContext must be used within a PWAProvider');
  }
  return ctx;
}

interface PWAProviderProps {
  children: ReactNode;
  onUpdateAvailable?: () => void;
}

export function PWAProvider({ children, onUpdateAvailable }: PWAProviderProps) {
  const registered = useRef(false);

  const pwa = usePWA(() => {
    onUpdateAvailable?.();
  });

  useEffect(() => {
    if (registered.current) return;
    if (IS_DEVELOPMENT) return;
    if (!('serviceWorker' in navigator)) return;

    registered.current = true;

    navigator.serviceWorker.register(SW_PATH, { scope: '/' }).catch(() => {
      // silent
    });
  }, []);

  return <PWAContext.Provider value={pwa}>{children}</PWAContext.Provider>;
}
