'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UrlShortener } from '@/components/linksnap/url-shortener';
import { LinkDashboard } from '@/components/linksnap/link-dashboard';
import { AdminPanel } from '@/components/linksnap/admin-panel';
import { Navbar } from '@/components/linksnap/navbar';
import { RedirectErrorBanner } from '@/components/linksnap/redirect-error-banner';
import { ViewSelector } from '@/components/linksnap/view-selector';
import { MarketingHeader } from '@/components/linksnap/marketing-header';
import { FeaturePillars } from '@/components/linksnap/feature-pillars';
import { useSession } from '@/components/shared/session-provider';
import { DashboardSkeleton } from '@/components/linksnap/ui/skeleton';
import { AdminValidator } from '@/domains/linksnap/domain/services/admin-validator';

interface RedirectError {
  type: string;
  code?: string;
}

export function HomePageClient() {
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

  const userEmail = user?.email ?? null;
  const isAdmin = userEmail ? AdminValidator.isAdmin(userEmail) : false;
  const effectiveView = selectedView === 'admin' && !isAdmin ? 'shorten' : selectedView;

  useEffect(() => {
    const titles: Record<string, string> = {
      shorten: 'اختصار الروابط - LinkSnap',
      dashboard: 'لوحة التحكم - LinkSnap',
      admin: 'الإدارة - LinkSnap',
    };
    document.title = titles[selectedView] || 'LinkSnap';
  }, [selectedView]);

  return (
    <main
      id="main-content"
      className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-8 flex flex-col justify-between max-w-5xl mx-auto overflow-hidden"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-gradient-to-br from-indigo-500/10 to-sky-500/5 blur-3xl pointer-events-none -z-10" />

      <Navbar />

      <div className="flex-1 flex flex-col justify-center max-w-xl w-full mx-auto space-y-8">
        <RedirectErrorBanner error={redirectError} onDismiss={() => setRedirectError(null)} />

        <motion.div
          key="app-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          <MarketingHeader isAuthenticated={!!user} />

          {user && (
            <ViewSelector
              selectedView={selectedView}
              userEmail={userEmail}
              onChange={setSelectedView}
            />
          )}

          <AnimatePresence mode="wait">
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

        {effectiveView === 'shorten' && <FeaturePillars />}
      </div>
    </main>
  );
}
