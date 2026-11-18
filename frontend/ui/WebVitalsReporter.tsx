'use client';

import { useEffect } from 'react';

import { detectAppPerfPlatform } from '@/frontend/shared/perf-marks';

const REPORT_PATH = '/api/app-perf';
const MAX_MS = 60_000;

/**
 * Field Core Web Vitals (#1498 follow-up). The launch/tap beacon covers the
 * instant-feel program; it says nothing about a server-rendered page's LCP or
 * about the layout stability of a feed. This reporter closes that gap with one
 * record per page life, sent when the document is hidden — off the paint path,
 * with `keepalive`, and never retried.
 *
 * The payload carries four numbers and the platform. No URL, path, user,
 * session, client id or user agent: the same boundary as the other beacon, so
 * the log line stays safe to grep and to keep.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    const metrics = { lcpMs: 0, cls: 0, inpMs: 0, ttfbMs: 0 };
    const observers: PerformanceObserver[] = [];

    const observe = (
      type: string,
      callback: PerformanceObserverCallback,
      options?: PerformanceObserverInit & { durationThreshold?: number }
    ) => {
      try {
        const observer = new PerformanceObserver(callback);
        observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit);
        observers.push(observer);
      } catch {
        // An engine without an entry type simply has no number for it.
      }
    };

    observe('largest-contentful-paint', (list) => {
      for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime;
    });
    observe('layout-shift', (list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          metrics.cls += (entry as PerformanceEntry & { value: number }).value;
        }
      }
    });
    observe(
      'event',
      (list) => {
        for (const entry of list.getEntries()) {
          const event = entry as PerformanceEntry & { duration: number; interactionId?: number };
          if (event.interactionId) metrics.inpMs = Math.max(metrics.inpMs, event.duration);
        }
      },
      { durationThreshold: 16 }
    );

    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    if (navigation) metrics.ttfbMs = navigation.responseStart;

    let sent = false;
    const send = () => {
      if (sent || !navigator.onLine) return;
      sent = true;
      const payload = JSON.stringify({
        version: 1,
        kind: 'vitals',
        platform: detectAppPerfPlatform(),
        lcpMs: Math.min(MAX_MS, Math.round(metrics.lcpMs)),
        cls: Math.min(10, Math.round(metrics.cls * 1000) / 1000),
        inpMs: Math.min(MAX_MS, Math.round(metrics.inpMs)),
        ttfbMs: Math.min(MAX_MS, Math.round(metrics.ttfbMs)),
      });
      void fetch(REPORT_PATH, {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', send);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', send);
      for (const observer of observers) observer.disconnect();
    };
  }, []);

  return null;
}
