'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAState {
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  registration: ServiceWorkerRegistration | null;
}

type PWAUpdateCallback = (registration: ServiceWorkerRegistration) => void;

export function usePWA(onUpdateAvailable?: PWAUpdateCallback) {
  const [state, setState] = useState<PWAState>({
    canInstall: false,
    isInstalled: false,
    isOnline: true,
    hasUpdate: false,
    registration: null,
  });

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const onUpdateRef = useRef(onUpdateAvailable);
  onUpdateRef.current = onUpdateAvailable;

  useEffect(() => {
    setState((prev) => ({ ...prev, isOnline: navigator.onLine }));

    const handleOnline = () => setState((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState((prev) => ({ ...prev, isOnline: false }));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setState((prev) => ({ ...prev, canInstall: true }));
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setState((prev) => ({ ...prev, canInstall: false, isInstalled: true }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.matches) {
      setState((prev) => ({ ...prev, isInstalled: true }));
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setState((prev) => ({ ...prev, registration: reg }));
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setState((prev) => ({ ...prev, hasUpdate: true }));
                onUpdateRef.current?.(reg);
              }
            };
          }
        };
      });

      const onControllerChange = () => {
        setState((prev) => ({ ...prev, hasUpdate: false }));
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    } else {
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    setState((prev) => ({ ...prev, canInstall: false }));
    return outcome === 'accepted';
  }, [installPrompt]);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({ ...prev, hasUpdate: false }));
  }, []);

  return { ...state, promptInstall, dismissUpdate };
}
