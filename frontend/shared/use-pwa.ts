'use client';

import { useState, useEffect, useCallback } from 'react';
import { requestPersistentStorage } from './persistent-storage';
import { applyWorkerUpdate, watchWorkerUpdates } from './sw-update';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAState {
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  registration: ServiceWorkerRegistration | null;
  /** A newer build is installed and waiting; `applyUpdate` moves onto it. */
  updateAvailable: boolean;
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    canInstall: false,
    isInstalled: false,
    isOnline: true,
    registration: null,
    updateAvailable: false,
  });

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

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
      // An install gesture is one of the signals browsers weigh when deciding
      // whether to grant durable storage (so the Local Store survives eviction).
      void requestPersistentStorage();
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
      });

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Announces a waiting build and keeps the document on the build its worker
   * serves: see `sw-update.ts`, ADR-0039 for the swap and ADR-0042 for the
   * prompt. Both matter inside the Android shell, which has no reload control.
   */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    return watchWorkerUpdates(navigator.serviceWorker, {
      onUpdateAvailable: (available) =>
        setState((prev) =>
          prev.updateAvailable === available ? prev : { ...prev, updateAvailable: available }
        ),
    });
  }, []);

  /** Moves this document onto the waiting build, replacing it once. */
  const applyUpdate = useCallback(() => {
    if (!('serviceWorker' in navigator)) return;
    void applyWorkerUpdate(navigator.serviceWorker);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    setState((prev) => ({ ...prev, canInstall: false }));
    return outcome === 'accepted';
  }, [installPrompt]);

  return { ...state, promptInstall, applyUpdate };
}
