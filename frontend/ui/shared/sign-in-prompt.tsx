'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { useSession } from '@/frontend/state/session-provider';

export function SignInPrompt({
  children,
  title = 'تسجيل الدُّخول مطلوب',
  description = 'هذه الميزة تحتاج إلى حساب. سجِّل الدُّخول لحفظ بياناتك ومزامنتها على كلِّ أجهزتك.',
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (user || isLoading) return <>{children}</>;

  const loginHref = `/auth/login?redirect=${encodeURIComponent(pathname || '/')}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-border/80 bg-card p-6 shadow-2xl">
        <DialogHeader className="space-y-2 text-start">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg font-bold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogActions onCancel={() => setOpen(false)}>
          <HeroCtaButton asChild className="w-full sm:w-auto">
            <Link href={loginHref}>تسجيل الدُّخول</Link>
          </HeroCtaButton>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
