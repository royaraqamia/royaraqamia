'use client';

import { useState } from 'react';
import { signInWithGoogle } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

export default function GoogleAuthButton({ redirectTo }: { redirectTo?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle(redirectTo);
    } catch (e: any) {
      if (e.message !== 'NEXT_REDIRECT') {
        setError(e.message || 'حدث خطأ غير متوقع');
      }
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        variant="outline"
        className="w-full py-3 h-auto flex items-center justify-center gap-3"
      >
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        <span>{loading ? 'جارٍ الاتصال بـ Google...' : 'تسجيل الدخول بواسطة Google'}</span>
      </Button>
      {error && (
        <div className="mt-3 p-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 shrink-0 mt-1"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
    </>
  );
}
