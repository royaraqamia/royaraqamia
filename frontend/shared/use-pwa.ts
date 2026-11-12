'use client';

import { useState, useEffect, useCallback } from 'react';
import { requestPersistentStorage } from './persistent-storage';
import {
  getShellUpdateState,
  loadShellUpdate,
  observeShellUpdate,
  shellVersionFromUserAgent,
} from './shell-update';
import { takeWaitingUpdateAtLoad, watchWorkerUpdates } from './sw-update';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAState {
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  registration: ServiceWorkerRegistration | null;
}

/**
 * How long a load waits for the shell to say whether it has an update of its
 * own. Past it the web take proceeds: the shell's card is a native overlay and a
 * page reload does not disturb it, so a slow manifest is not a reason to hold a
 * document on an old build.
 */
const SHELL_ANSWER_DEADLINE_MS = 1_000;

/** Resolves when `promise` settles or `ms` passes, whichever is first. */
function settledBy(promise: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([
    promise.then(
      () => undefined,
      () => undefined
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
  ]);
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    canInstall: false,
    isInstalled: false,
    isOnline: true,
    registration: null,
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
   * The update surface (ADR-0134, ADR-0171). A document load is the one moment
   * the page may move itself: if a build is downloaded and waiting, it takes
   * control and this document reloads once — in the next pause if the person is
   * already using the page, and when the tab becomes visible if it loaded in the
   * background. A document that is only sitting there is never reloaded, and the
   * person is never asked.
   *
   * It stands down while the shell is announcing its own update (ADR-0043): one
   * update at a time, and the APK install brings a newer web build with it.
   */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const shellIsUpdating = async (): Promise<boolean> => {
      // A browser has no shell to be behind.
      if (shellVersionFromUserAgent(navigator.userAgent) === null) return false;
      await settledBy(loadShellUpdate(), SHELL_ANSWER_DEADLINE_MS);
      return getShellUpdateState().updatePending;
    };

    void takeWaitingUpdateAtLoad({
      serviceWorker: navigator.serviceWorker,
      isSuppressed: shellIsUpdating,
    });
  }, []);

  /**
   * The fallback half: the worker reports a chunk that neither the cache nor the
   * network can answer — the document's build is genuinely gone — and only that
   * replaces this document, once it is visible and has no work left to lose
   * (ADR-0171). A swap alone is no longer a reason to reload.
   */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    return watchWorkerUpdates(navigator.serviceWorker);
  }, []);

  /**
   * The shell channel: inside the Android shell a new APK is something the shell
   * announces itself (ADR-0043). A browser has no such bridge, and the observer
   * is a no-op there.
   */
  useEffect(() => observeShellUpdate(), []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    setState((prev) => ({ ...prev, canInstall: false }));
    return outcome === 'accepted';
  }, [installPrompt]);

  return { ...state, promptInstall };
}
