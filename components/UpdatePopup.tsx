'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface UpdatePopupProps {
  onReload: () => void;
  onDismiss: () => void;
}

export function UpdatePopup({ onReload, onDismiss }: UpdatePopupProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    dismissTimerRef.current = setTimeout(onDismiss, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleDismiss]);

  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const focusable = containerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable.item(0);
    first?.focus();
  }, [visible]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-9999 grid place-items-center p-6 max-md:items-end"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="تحديث متاح"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleDismiss}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full border border-border bg-card shadow-2xl shadow-primary/5
              max-w-sm rounded-3xl
              max-h-[85dvh] overflow-y-auto
              max-md:w-[calc(100%-48px)] max-md:max-w-full max-md:rounded-t-3xl max-md:rounded-b-none"
          >
            <div className="relative flex flex-col items-center px-6 pt-8 pb-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <svg
                  className="h-7 w-7 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                  />
                </svg>
              </div>

              <h2 className="mb-1.5 font-arabic text-xl font-bold text-foreground">تحديث متاح</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                نسخة جديدة من الموقع جاهزة. يُرجَى تحديث الصَّفحة للحصول على أحدث الميِّزات وإصلاحات
                الأخطاء.
              </p>
            </div>

            <div className="flex gap-2 border-t border-border bg-muted/30 px-6 py-4">
              <button
                onClick={handleDismiss}
                className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                لاحقًا
              </button>
              <button
                onClick={onReload}
                className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.98]"
              >
                تحديث الآن
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
