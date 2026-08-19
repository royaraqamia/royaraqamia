'use client';

import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '@/frontend/shared/constants';

const MIN_WIDGET_WIDTH = 300;

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  onToken: (token: string | null) => void;
  theme?: 'light' | 'dark' | 'auto';
}

export function Turnstile({ onToken, theme = 'auto' }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scale, setScale] = useState(1);
  const siteKey = TURNSTILE_SITE_KEY;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const applyScale = () => {
      const width = el.clientWidth;
      setScale(width > 0 && width < MIN_WIDGET_WIDTH ? width / MIN_WIDGET_WIDTH : 1);
    };

    applyScale();
    const observer = new ResizeObserver(applyScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    function renderTurnstile() {
      if (!window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
        theme,
      });
    }

    if (window.turnstile) {
      renderTurnstile();
    } else {
      const checkTurnstile = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkTurnstile);
          renderTurnstile();
        }
      }, 100);
      pollTimerRef.current = checkTurnstile;
      setTimeout(() => clearInterval(checkTurnstile), 10000);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey, onToken, theme]);

  if (!siteKey) return null;

  return (
    <div className="my-4 w-full max-w-md mx-auto">
      <div
        role="region"
        aria-label="فحص الأمان للتَّحقُّق البشري"
        className="group relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-50/60 p-3.5 sm:p-4 shadow-xs backdrop-blur-md transition-all duration-300 ease-out hover:border-neutral-300 hover:shadow-md dark:border-neutral-800/80 dark:bg-neutral-900/60 dark:hover:border-neutral-700"
      >
        {/* توهج شبكي محيطي خفيف */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-28 w-48 -translate-x-1/2 rounded-full bg-linear-to-tr from-violet-500/10 via-purple-500/10 to-indigo-500/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 dark:from-violet-500/15 dark:via-purple-500/15 dark:to-indigo-500/15"
        />

        {/* رأس البطاقة ومؤشر الحالة */}
        <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/20">
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span className="text-xs font-semibold tracking-tight text-neutral-800 dark:text-neutral-200">
              التَّحقُّق الأمني
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-neutral-500 dark:text-neutral-400">
              مُشفَّر
            </span>
          </div>
        </div>

        {/* حاوية تركيب Turnstile */}
        <div className="relative flex min-h-16.25 w-full items-center justify-center overflow-hidden rounded-xl bg-white/80 p-1 ring-1 ring-neutral-200/50 dark:bg-neutral-950/80 dark:ring-neutral-800/50">
          <div
            ref={containerRef}
            className="flex min-h-16.25 w-full items-center justify-center transition-opacity duration-300 ease-in-out"
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  );
}
