'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UrlShortener } from '@/frontend/ui/linksnap/url-shortener';
import { LinkDashboard } from '@/frontend/ui/linksnap/link-dashboard';
import { AdminPanel } from '@/frontend/ui/linksnap/admin-panel';
import { RedirectErrorBanner } from '@/frontend/ui/linksnap/redirect-error-banner';
import { ViewSelector } from '@/frontend/ui/linksnap/view-selector';
import { useSession } from '@/frontend/ui/shared/session-provider';
import { DashboardSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';

interface RedirectError {
  type: string;
  code?: string;
}

export function LinkSnapAppView({ isAdmin }: { isAdmin: boolean }) {
  const { user, session } = useSession();
  const [selectedView, setSelectedView] = useState<'shorten' | 'dashboard' | 'admin'>('shorten');
  const [redirectError, setRedirectError] = useState<RedirectError | null>(null);

  const parsedParams = useRef(false);
  useEffect(() => {
    if (parsedParams.current) return;
    parsedParams.current = true;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        window.location.replace('/auth/callback' + hash);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get('error');
      const codeParam = params.get('code');

      if (errorParam === 'oauth_failed') {
        const details = params.get('details') || '';
        queueMicrotask(() => {
          setRedirectError({ type: 'oauth_failed', code: details });
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (errorParam && codeParam) {
        queueMicrotask(() => {
          setRedirectError({ type: errorParam, code: codeParam });
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const viewParam = params.get('view');
      if (viewParam === 'dashboard' || viewParam === 'admin') {
        queueMicrotask(() => {
          setSelectedView(viewParam);
        });
      }
    }
  }, []);

  useEffect(() => {
    if (parsedParams.current) {
      const url = new URL(window.location.href);
      if (selectedView === 'shorten') {
        url.searchParams.delete('view');
      } else {
        url.searchParams.set('view', selectedView);
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedView]);

  const effectiveView = selectedView === 'admin' && !isAdmin ? 'shorten' : selectedView;

  return (
    <div className="relative flex flex-col min-h-full overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-125 h-75 bg-linear-to-br from-primary/10 to-accent/5 blur-3xl pointer-events-none -z-10" />

      <div className="flex-1 flex flex-col justify-center max-w-xl w-full mx-auto space-y-8">
        <RedirectErrorBanner error={redirectError} onDismiss={() => setRedirectError(null)} />

        <motion.div
          key="app-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          <h1 className="text-3xl font-display font-bold tracking-tight">إدارة الرَّوابط</h1>

          {user && (
            <ViewSelector
              selectedView={selectedView}
              isAdmin={isAdmin}
              onChange={setSelectedView}
            />
          )}

          <AnimatePresence mode="wait" aria-live="polite">
            {effectiveView === 'shorten' ? (
              <motion.div
                key="shorten-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <UrlShortener
                  token={session?.access_token ?? null}
                  onLinkCreated={() => {
                    if (user) setSelectedView('dashboard');
                  }}
                />
              </motion.div>
            ) : effectiveView === 'dashboard' ? (
              user && (
                <motion.div
                  key="dashboard-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Suspense fallback={<DashboardSkeleton />}>
                    <LinkDashboard token={session?.access_token ?? ''} refreshTrigger={0} />
                  </Suspense>
                </motion.div>
              )
            ) : effectiveView === 'admin' ? (
              user && (
                <motion.div
                  key="admin-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AdminPanel token={session?.access_token ?? ''} />
                </motion.div>
              )
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
