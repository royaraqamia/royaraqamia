'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { signInWithGoogle } from '@/frontend/api/auth';
import { ApiError } from '@/frontend/transport/http';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';

import { GoogleLogo } from './GoogleLogo';

const FAILED = 'حدث خطأ أثناء الاتِّصال بـ Google. يُرجَى المحاولة لاحقًا.';
const UNREACHABLE = 'لم نتمكَّن من الوصول إلى Google. تحقَّق من اتِّصالك ثم أعد المحاولة.';

interface GoogleAuthButtonProps {
  /** The page the visitor lands on once Google answers. */
  redirectTo: string;
  label: string;
  busyLabel: string;
}

/**
 * The site's one Google action (#1500).
 *
 * It is the same button on `/auth/login` and `/auth/signup` because the provider
 * makes it one action: Supabase creates the account on a first Google sign-in
 * and signs in on every later one, so the visitor never has to know which of the
 * two pages they are on. That is why the label says «المتابعة» rather than
 * "sign in" or "sign up" — both would be wrong for half the people pressing it.
 *
 * It sits above the email form on both pages because it is one press with
 * nothing to remember, and it is white with Google's own mark: the site's
 * gradient belongs to its own calls to action, and a gradient Google button is
 * both off-brand and less recognisable as the Google path.
 */
export function GoogleAuthButton({ redirectTo, label, busyLabel }: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  async function start() {
    setLoading(true);
    setError(null);
    setOffline(false);

    try {
      await signInWithGoogle(redirectTo);
    } catch (e) {
      if (e instanceof ApiError && e.isNetworkError) {
        setOffline(true);
      } else if (e instanceof Error && e.message !== 'NEXT_REDIRECT') {
        setError(FAILED);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={loading}
        className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-zinc-950/10 bg-white px-5 text-sm font-bold text-zinc-900 shadow-sm transition-safe duration-200 hover:bg-zinc-50 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-80 sm:text-base dark:border-white/20 dark:bg-white dark:hover:bg-zinc-100"
      >
        {loading ? (
          <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleLogo size={20} className="shrink-0" />
        )}
        <span>{loading ? busyLabel : label}</span>
      </button>

      {offline && <NeedsConnection variant="inline" message={UNREACHABLE} />}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-center text-xs font-medium text-destructive sm:text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
