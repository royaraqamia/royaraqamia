'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { useSession } from '@/frontend/state/session-provider';

const DISMISS_KEY = 'royaraqamia.guest-mode.dismissed';

export function GuestModeBanner() {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (isLoading || user || dismissed) return null;

  const loginHref = `/auth/login?redirect=${encodeURIComponent(pathname || '/')}`;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — keep it hidden for this session */
    }
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-foreground sm:items-center">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" aria-hidden="true" />
        <span>
          أنت تستعرض <span className="font-bold">وضع الضَّيف</span> — بياناتك محفوظة على هذا الجهاز
          فقط. سجِّل الدُّخول لحفظها ومزامنتها على كلِّ أجهزتك.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button asChild size="sm" className="shrink-0">
          <Link href={loginHref}>تسجيل الدُّخول</Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="إخفاء تنبيه وضع الضَّيف"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
