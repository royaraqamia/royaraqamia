'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { usePWA, type PWAState } from '../shared/use-pwa';
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

    // Register only after the page is fully loaded and the main thread is
    // idle: SW install/bytecode parsing otherwise competes with hydration
    // and first render for CPU/network on low-end devices.
    const register = () => {
      navigator.serviceWorker.register(SW_PATH, { scope: '/' }).catch(() => {
        // silent
      });
    };

    const registerWhenIdle = () => {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      };
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleWindow.requestIdleCallback(register, { timeout: 5000 });
      } else {
        window.setTimeout(register, 2000);
      }
    };

    if (document.readyState === 'complete') {
      registerWhenIdle();
      return;
    }

    window.addEventListener('load', registerWhenIdle, { once: true });
    return () => window.removeEventListener('load', registerWhenIdle);
  }, []);

  return <PWAContext.Provider value={pwa}>{children}</PWAContext.Provider>;
}
