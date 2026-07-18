'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, LogIn } from 'lucide-react';
import { signInWithGoogle } from '@/lib/actions/auth';
import { useFocusTrap } from '@/domains/linksnap/hooks/use-focus-trap';

const POPUP_STORAGE_KEY = 'linksnap_auth_popup_dismissed';

interface AuthPopupProps {
  open: boolean;
  onClose: () => void;
}

export function AuthPopup({ open, onClose }: AuthPopupProps) {
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
    } else if (lastFocusedRef.current) {
      lastFocusedRef.current.focus();
      lastFocusedRef.current = null;
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  const dialogRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
        setError(e.message || 'فشل تسجيل الدخول بواسطة Google. حاول مرة أخرى.');
      }
      setGoogleLoading(false);
    }
  }, []);

  const handleEmailLogin = useCallback(() => {
    sessionStorage.setItem(POPUP_STORAGE_KEY, 'true');
    onClose();
    router.push('/auth/login?redirect=/linksnap');
  }, [onClose, router]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="تسجيل الدخول"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-popup-title"
            aria-describedby="auth-popup-description"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-sm mx-4 p-8 focus:outline-none"
          >
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer focus-ring"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center mb-5 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                <LogIn aria-hidden="true" className="w-6 h-6 text-white" />
              </div>

              <h3
                id="auth-popup-title"
                className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2"
              >
                مرحبًا بك في LinkSnap
              </h3>
              <p
                id="auth-popup-description"
                className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed"
              >
                سجِّل الدخول لاختصار الروابط وتتبُّع الأداء في الوقت الفعلي.
              </p>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    key="popup-error"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    aria-live="polite"
                    className="w-full p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg font-medium"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="button"
                disabled={googleLoading}
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl transition-all border-2 border-slate-200 dark:border-slate-600 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 flex items-center justify-center gap-3 disabled:opacity-50 disabled:shadow-none cursor-pointer press-scale"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" role="status" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                <span>المتابعة عبر Google</span>
              </button>

              <div className="mt-6">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  أو{' '}
                  <button
                    type="button"
                    onClick={handleEmailLogin}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer press-opacity"
                  >
                    تسجيل الدخول بالبريد الإلكتروني
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
