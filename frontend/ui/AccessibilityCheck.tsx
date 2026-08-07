'use client';

import { useEffect, useState } from 'react';
import { IS_DEVELOPMENT } from '@/frontend/shared/constants';

export function AccessibilityCheck() {
  const [status, setStatus] = useState<'initializing' | 'active' | 'unavailable'>('initializing');
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!IS_DEVELOPMENT) return;
    const run = async () => {
      try {
        const React = await import('react');
        const ReactDOM = await import('react-dom');
        const axe = await import('@axe-core/react');
        axe.default(React.default, ReactDOM.default, 1000);
        setStatus('active');
      } catch {
        // axe-core unavailable — skip
        setStatus('unavailable');
      }
    };
    run();
  }, []);

  if (!IS_DEVELOPMENT) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Accessibility Audit Status"
      className="fixed bottom-4 right-4 z-9999 w-full max-w-[calc(100vw-2rem)] sm:max-w-xs font-sans pointer-events-auto select-none"
    >
      <div className="group relative overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-950/90 p-3 shadow-2xl shadow-black/80 backdrop-blur-xl transition-all duration-300 ease-out hover:border-neutral-700/80 hover:shadow-emerald-500/5">
        {/* Subtle Ambient Background Gradient Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-40"
        />

        <div className="relative flex items-center justify-between gap-3">
          {/* Status Beacon & Metadata */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              {status === 'active' && (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </>
              )}
              {status === 'initializing' && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              )}
              {status === 'unavailable' && <span className="h-2 w-2 rounded-full bg-neutral-500" />}
            </span>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-semibold tracking-wider text-neutral-400 uppercase">
                  a11y تقييم
                </span>
                <span className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[9px] font-medium text-neutral-300 border border-neutral-700/50">
                  DEV
                </span>
              </div>
              <p className="truncate text-xs font-medium text-neutral-200">
                {status === 'active' && 'axe-core active'}
                {status === 'initializing' && 'Initializing...'}
                {status === 'unavailable' && 'axe-core unavailable'}
              </p>
            </div>
          </div>

          {/* Minimize / Expand Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMinimized((prev) => !prev)}
            aria-label={
              isMinimized ? 'Expand accessibility drawer' : 'Collapse accessibility drawer'
            }
            className="group/btn relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/80 text-neutral-400 transition-all duration-200 hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 active:scale-95"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                isMinimized ? 'rotate-180' : 'rotate-0'
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* Expandable Info Drawer */}
        {!isMinimized && (
          <div className="mt-2.5 pt-2.5 border-t border-neutral-800/60 transition-all duration-300 ease-out">
            <div className="flex flex-col gap-1.5 text-[11px] text-neutral-400">
              <div className="flex items-center justify-between text-neutral-400">
                <span>Console Audits:</span>
                <span className="font-mono text-emerald-400 font-medium">1000ms تأخير</span>
              </div>
              <p className="text-[10px] leading-relaxed text-neutral-500">
                Inspect browser developer console for live accessibility warnings & DOM violation
                reports.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
